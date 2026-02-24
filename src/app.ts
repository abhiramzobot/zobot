import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Redis from 'ioredis';
import { env } from './config/env';
import { logger } from './observability/logger';
import { httpRequestDuration } from './observability/metrics';
import { registerBuiltinTools } from './tools/registry';
import { createConversationStore } from './memory/conversation-memory';
import { createTicketingService } from './ticketing/ticketing-service';
import { SalesIQOutboundAdapter } from './channels/salesiq-adapter';
import { Orchestrator } from './orchestrator/orchestrator';
import { AgentCore } from './agent/agent-core';
import { buildProviders } from './llm/provider-factory';
import { ModelRouter } from './llm/model-router';
import { LLMProviderName, RoutingStrategy } from './llm/types';
import { registerSalesIQWebhook } from './channels/salesiq-webhook';
import { registerAdminRoutes } from './admin/admin-routes';
import { registerHealthRoutes } from './health/health-routes';
import { registerTestChatEndpoint } from './channels/test-chat-endpoint';
import { registerChatSessionRoutes } from './channels/chat-session-routes';
import { registerChatUI } from './channels/chat-ui';
import { registerChatUpload } from './channels/chat-upload';
import { createSessionStore } from './session/session-store';

// Learning pipeline imports
import { createLearningStore } from './learning/learning-store';
import { ConversationCollector } from './learning/conversation-collector';
import { LearningPipeline } from './learning/pipeline';
import { LearningScheduler } from './learning/scheduler';
import { KnowledgeUpdater } from './learning/knowledge-updater';
import { PromptTracker } from './learning/prompt-tracker';
import { FAQDiscoveryAnalyzer } from './learning/analyzers/faq-discovery';
import { KnowledgeGapAnalyzer } from './learning/analyzers/knowledge-gap';
import { EscalationPatternAnalyzer } from './learning/analyzers/escalation-patterns';
import { ResponseQualityAnalyzer } from './learning/analyzers/response-quality';
import { IntentPatternAnalyzer } from './learning/analyzers/intent-patterns';
import { SentimentTrendAnalyzer } from './learning/analyzers/sentiment-trends';
import { VOCQualityAnalyzer } from './learning/analyzers/voc-quality';

// VOC Intelligence imports
import { VOCPreProcessor, createVOCStore } from './voc';

// Hybrid RAG imports
import { OpenAIEmbeddingProvider } from './knowledge/embedding-service';
import { knowledgeService } from './knowledge/knowledge-service';

// Proactive Support imports
import { ProactiveChecker } from './voc/proactive-checker';

// PII Governance imports
import { PIIClassifier } from './security/pii-classifier';
import { createPIIVault } from './security/pii-vault';
import { initPIIRedactor } from './observability/pii-redactor';

// ───── Enhancement v2 Imports ─────
import { createCacheStore } from './cache/cache-service';
import { createAuditStore } from './audit/audit-store';
import { initAuditService } from './audit/audit-service';
import { createDedupStore } from './security/dedup-store';
import { setDedupStore } from './channels/salesiq-webhook';
import { initDependencyHealth } from './resilience/dependency-health';
import { CoPilotService } from './copilot/copilot-service';
import { registerCoPilotRoutes } from './copilot/copilot-routes';
import { createSLAStore } from './sla/sla-store';
import { SLAEngine } from './sla/sla-engine';
import { SLAAlerter } from './sla/sla-alerter';
import { createCustomerLinker } from './session/customer-linker';
import { GDPRService } from './audit/gdpr-service';
import { ProfileLoader } from './customer360/profile-loader';
import { AnalyticsEngine } from './analytics/analytics-engine';
import { registerAnalyticsRoutes } from './analytics/analytics-routes';
import { ExperimentEngine } from './experiment/experiment-engine';
import { OutboundEngine } from './outbound/outbound-engine';
import { FeedbackCollector } from './copilot/feedback-collector';
import { SkillRouter } from './routing/skill-router';
import { IncidentDetector } from './resilience/incident-detector';

export interface AppContext {
  app: FastifyInstance;
  redis?: Redis;
  scheduler?: LearningScheduler;
}

export async function buildApp(): Promise<AppContext> {
  // Initialize Fastify
  const app = Fastify({
    logger: false, // We use our own Pino logger
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MB
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH'],
  });

  // Register multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: env.chat.maxUploadSizeMb * 1024 * 1024,
      files: 5,
    },
  });

  // Add raw body support for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      (req as unknown as { rawBody: string }).rawBody = body as string;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Request timing middleware
  app.addHook('onResponse', (req, reply, done) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequestDuration.observe(
      { method: req.method, route, status_code: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
    done();
  });

  // Initialize Redis (optional)
  let redis: Redis | undefined;
  try {
    const redisInstance = new Redis(env.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    // Attach error handler BEFORE connect to prevent unhandled error events
    redisInstance.on('error', (err) => {
      logger.debug({ err: err.message }, 'Redis connection error (handled)');
    });
    await redisInstance.connect();
    redis = redisInstance;
    logger.info('Redis connected');
  } catch (err) {
    logger.warn({ err }, 'Redis not available; using in-memory fallback');
    redis = undefined;
  }

  // ───── Initialize PII Governance ─────
  const piiClassifier = new PIIClassifier();
  initPIIRedactor(piiClassifier);
  const piiVault = createPIIVault(redis, env.pii.encryptionKey);
  logger.info({ enabled: env.pii.enabled }, 'PII governance initialized');

  // ───── Build Multi-LLM Provider Stack ─────
  const providers = buildProviders(env);

  const routerConfig = {
    primaryProvider: env.llm.primaryProvider as LLMProviderName,
    secondaryProvider: (env.llm.secondaryProvider || undefined) as LLMProviderName | undefined,
    tertiaryProvider: (env.llm.tertiaryProvider || undefined) as LLMProviderName | undefined,
    strategy: env.llm.routingStrategy as RoutingStrategy,
    abTestSplit: env.llm.abTestSplit,
  };

  const modelRouter = new ModelRouter(routerConfig, providers);
  const agent = new AgentCore(modelRouter);

  logger.info({
    primary: routerConfig.primaryProvider,
    secondary: routerConfig.secondaryProvider,
    strategy: routerConfig.strategy,
    providerCount: providers.size,
  }, 'Multi-LLM stack initialized');

  // ───── Initialize Learning Pipeline ─────
  const learningStore = createLearningStore(redis);
  const conversationCollector = new ConversationCollector(learningStore, env.learning.enabled);

  // Build analyzers
  const analyzers = [
    new FAQDiscoveryAnalyzer(learningStore),
    new KnowledgeGapAnalyzer(),
    new EscalationPatternAnalyzer(),
    new ResponseQualityAnalyzer(),
    new IntentPatternAnalyzer(),
    new SentimentTrendAnalyzer(),
    new VOCQualityAnalyzer(),
  ];

  const learningPipeline = new LearningPipeline(learningStore, analyzers);
  const intervalMs = env.learning.pipelineIntervalHours * 60 * 60 * 1000;
  const learningScheduler = new LearningScheduler(learningPipeline, intervalMs);
  const knowledgeUpdater = new KnowledgeUpdater(learningStore);
  const promptTracker = new PromptTracker(learningStore);

  // Start learning scheduler if enabled
  let scheduler: LearningScheduler | undefined;
  if (env.learning.enabled) {
    learningScheduler.start();
    scheduler = learningScheduler;
    logger.info({
      intervalHours: env.learning.pipelineIntervalHours,
      analyzerCount: analyzers.length,
    }, 'Learning pipeline initialized');
  }

  // ───── Initialize VOC Intelligence ─────
  const vocPreProcessor = new VOCPreProcessor();
  const vocStore = createVOCStore(redis);
  logger.info('VOC intelligence pipeline initialized');

  // ───── Initialize Hybrid RAG (Vector Search) ─────
  if (env.rag.enabled) {
    try {
      const embeddingProvider = new OpenAIEmbeddingProvider();
      knowledgeService.setEmbeddingProvider(embeddingProvider);
      await knowledgeService.initializeVectorIndex();
      logger.info('Hybrid RAG (BM25 + Vector) initialized');
    } catch (err) {
      logger.warn({ err }, 'Vector search initialization failed; falling back to keyword-only');
    }
  }

  // ───── Enhancement v2: Initialize Infrastructure ─────

  // Cache service
  const cacheStore = createCacheStore(redis, { keyPrefix: 'resolvr:cache:' });
  logger.info('Cache service initialized');

  // Audit trail
  const auditStore = createAuditStore(redis);
  const auditService = initAuditService(auditStore);
  await auditService.init();
  logger.info('Audit trail initialized (SHA-256 chain hashing)');

  // Webhook deduplication
  const dedupStore = createDedupStore(redis);
  setDedupStore(dedupStore);
  logger.info('Webhook deduplication initialized');

  // Dependency health monitoring
  const depHealth = initDependencyHealth();
  logger.info('Dependency health monitoring initialized');

  // SLA management
  const slaStore = createSLAStore(redis);
  const slaEngine = new SLAEngine(slaStore);
  const slaAlerter = new SLAAlerter();
  logger.info({ enabled: env.sla.enabled }, 'SLA management initialized');

  // Customer linker (omnichannel continuity)
  const customerLinker = createCustomerLinker(redis);
  logger.info('Omnichannel customer linker initialized');

  // GDPR service
  const conversationStore = createConversationStore(redis);
  const gdprService = new GDPRService(conversationStore, auditStore, piiVault);
  logger.info('GDPR service initialized');

  // Customer 360 profile loader
  const profileLoader = new ProfileLoader(cacheStore, {
    enabled: env.customer360.enabled,
    cacheTtlSeconds: env.customer360.cacheTtlSeconds,
    vipDetection: true,
    vipLtvThreshold: 50000,
  });
  logger.info({ enabled: env.customer360.enabled }, 'Customer 360 initialized');

  // A/B Testing engine
  const experimentEngine = new ExperimentEngine();
  logger.info('A/B testing engine initialized');

  // Outbound proactive engine
  const outboundEngine = new OutboundEngine({
    enabled: env.outbound.enabled,
    governance: {
      maxPerDay: env.outbound.maxPerDay,
      quietHoursStart: env.outbound.quietHoursStart,
      quietHoursEnd: env.outbound.quietHoursEnd,
      dndEnabled: true,
    },
    defaultChannel: 'whatsapp',
  });
  logger.info({ enabled: env.outbound.enabled }, 'Outbound engine initialized');

  // In-Chat Cart service
  const { initCartService } = require('./cart/cart-service');
  initCartService();
  logger.info('In-chat cart service initialized');

  // Zoho Lens AR client
  const { initLensClient } = require('./lens/lens-client');
  initLensClient({
    enabled: env.zohoLens.enabled,
    baseUrl: env.zohoLens.baseUrl,
    accountsUrl: env.zohoLens.accountsUrl,
    clientId: env.zohoLens.clientId,
    clientSecret: env.zohoLens.clientSecret,
    refreshToken: env.zohoLens.refreshToken,
    departmentId: env.zohoLens.departmentId,
    technicianEmail: env.zohoLens.technicianEmail,
  });
  logger.info({ enabled: env.zohoLens.enabled }, 'Zoho Lens AR client initialized');

  // ───── Enhancement v5: Initialize New Services ─────

  // Coupon/Discount Engine (A1)
  const { initCouponService } = require('./coupon/coupon-service');
  initCouponService();
  logger.info('Coupon/discount engine initialized (5 demo coupons seeded)');

  // AI Product Recommendation Engine (A4)
  const { initRecommendationEngine } = require('./recommendations/recommendation-engine');
  initRecommendationEngine();
  logger.info('AI recommendation engine initialized');

  // Conversation Summarizer (B2)
  const { initSummarizer } = require('./summarization/summarizer');
  initSummarizer();
  logger.info('Conversation summarizer initialized');

  // Product Review Service (C1)
  const { initReviewService } = require('./reviews/review-service');
  initReviewService();
  logger.info('Product review service initialized');

  // Cart Abandonment Detector (A2)
  const { initAbandonmentDetector } = require('./cart/abandonment-detector');
  const abandonmentDetector = initAbandonmentDetector({
    enabled: env.cartAbandonment.enabled,
    abandonmentDelayMinutes: env.cartAbandonment.abandonmentDelayMinutes,
    checkIntervalMinutes: env.cartAbandonment.checkIntervalMinutes,
    recoveryCouponPercent: env.cartAbandonment.recoveryCouponPercent,
    recoveryCouponExpiryHours: env.cartAbandonment.recoveryCouponExpiryHours,
  });
  abandonmentDetector.start();
  logger.info({ enabled: env.cartAbandonment.enabled }, 'Cart abandonment detector initialized');

  // Agent feedback collector
  const feedbackCollector = new FeedbackCollector();

  // Skill-based router
  const skillRouter = new SkillRouter();

  // Incident detector
  const incidentDetector = new IncidentDetector();

  // Analytics engine
  const analyticsEngine = new AnalyticsEngine(learningStore);

  // ───── Initialize Core Services ─────
  registerBuiltinTools();
  const sessionStore = createSessionStore(redis);
  const ticketingService = createTicketingService();
  const outboundAdapter = new SalesIQOutboundAdapter();
  const proactiveChecker = new ProactiveChecker();
  const orchestrator = new Orchestrator(
    conversationStore,
    ticketingService,
    outboundAdapter,
    agent,
    conversationCollector,
    vocPreProcessor,
    vocStore,
    proactiveChecker,
  );

  // ───── Wire Enhancement v2 into Orchestrator + ToolRuntime ─────
  orchestrator.setEnhancementV2({
    slaEngine,
    slaAlerter,
    customerLinker,
    profileLoader,
    experimentEngine,
    skillRouter,
  });

  // Wire cache into tool runtime for result caching
  const { toolRuntime } = require('./tools/runtime');
  toolRuntime.setCacheStore(cacheStore);
  toolRuntime.setFeedbackCollector(feedbackCollector);
  logger.info('Enhancement v2 wired into orchestrator + tool runtime');

  // Co-Pilot service
  const copilotService = new CoPilotService(agent);
  logger.info('Co-Pilot service initialized');

  // ───── Register Routes ─────
  registerHealthRoutes(app, redis, agent);
  registerAdminRoutes(app, {
    store: learningStore,
    scheduler: learningScheduler,
    knowledgeUpdater,
    promptTracker,
    vocStore,
  });
  registerSalesIQWebhook(app, orchestrator);
  registerTestChatEndpoint(app, conversationStore, agent, sessionStore);
  registerChatSessionRoutes(app, conversationStore, sessionStore, ticketingService, conversationCollector);
  registerChatUpload(app);
  registerChatUI(app);

  // Enhancement v2 routes
  registerCoPilotRoutes(app, copilotService, conversationStore);
  registerAnalyticsRoutes(app, analyticsEngine);

  // Enhancement v2: GDPR, SLA, Audit, Experiment admin routes
  registerEnhancementV2AdminRoutes(app, {
    auditService, gdprService, slaEngine, slaStore, slaAlerter,
    experimentEngine, feedbackCollector, skillRouter, incidentDetector,
    customerLinker, depHealth, outboundEngine, profileLoader,
    conversationStore,
  });

  // Enhancement v5: Flow Builder routes (D1)
  const { registerFlowBuilderRoutes } = require('./admin/flow-builder-routes');
  const { registerFlowBuilderUI } = require('./admin/flow-builder-ui');
  registerFlowBuilderRoutes(app, redis);
  registerFlowBuilderUI(app);
  logger.info('No-Code Flow Builder registered at /admin/flow-builder');

  // Register cart_abandonment outbound template (A2)
  outboundEngine.registerTemplate({
    id: 'cart_abandonment',
    name: 'Cart Abandonment Recovery',
    channel: 'whatsapp',
    body: 'Hey {{customerName}}! You left some items in your cart worth ₹{{cartTotal}}. Use code {{couponCode}} to get {{discountPercent}}% off! Complete your order now: {{cartUrl}}',
    variables: ['customerName', 'cartTotal', 'couponCode', 'discountPercent', 'cartUrl'],
    language: 'en',
  });

  logger.info('All Enhancement v5 systems initialized (8 new tools, 29 total)');

  return { app, redis, scheduler };
}

// ───── Enhancement v2 Admin Routes ──────────────────────────────

function registerEnhancementV2AdminRoutes(
  app: import('fastify').FastifyInstance,
  deps: Record<string, unknown>,
): void {
  const { env: e } = require('./config/env');
  const verifyAdmin = (req: any, reply: any): boolean => {
    const key = req.headers['x-admin-api-key'] as string | undefined;
    if (!key || key !== e.security.adminApiKey) {
      reply.status(403).send({ error: 'Forbidden' });
      return false;
    }
    return true;
  };

  const auditService = deps.auditService as import('./audit/audit-service').AuditService;
  const gdprService = deps.gdprService as GDPRService;
  const slaEngine = deps.slaEngine as SLAEngine;
  const experimentEngine = deps.experimentEngine as ExperimentEngine;
  const feedbackCollector = deps.feedbackCollector as FeedbackCollector;
  const incidentDetector = deps.incidentDetector as IncidentDetector;
  const depHealth = deps.depHealth as ReturnType<typeof initDependencyHealth>;

  // Audit trail endpoints
  app.get('/admin/audit/trail', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const q = req.query as Record<string, string>;
    const events = await auditService.getAuditTrail({
      conversationId: q.conversationId,
      category: q.category as any,
      limit: q.limit ? parseInt(q.limit) : 100,
    });
    return reply.send({ status: 'ok', events });
  });

  app.get('/admin/audit/verify', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const q = req.query as Record<string, string>;
    const result = await auditService.verifyIntegrity(q.conversationId);
    return reply.send({ status: 'ok', integrity: result });
  });

  // GDPR endpoints
  app.post('/admin/gdpr/export', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const { customerId, conversationIds } = req.body as { customerId: string; conversationIds: string[] };
    const data = await gdprService.exportCustomerData(customerId, conversationIds);
    return reply.send({ status: 'ok', data });
  });

  app.post('/admin/gdpr/erase', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const { customerId, conversationIds } = req.body as { customerId: string; conversationIds: string[] };
    const result = await gdprService.eraseCustomerData(customerId, conversationIds);
    return reply.send({ status: 'ok', result });
  });

  // SLA dashboard
  app.get('/admin/sla/dashboard', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const active = await (deps.slaStore as import('./sla/types').SLAStore).getActive();
    const since = Date.now() - 24 * 3600 * 1000;
    const breached = await (deps.slaStore as import('./sla/types').SLAStore).getBreached(since);
    return reply.send({ status: 'ok', active: active.length, breached: breached.length });
  });

  // Experiment endpoints
  app.get('/admin/experiments', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    return reply.send({ status: 'ok', experiments: experimentEngine.getAll() });
  });

  // Feedback summary
  app.get('/admin/feedback/summary', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const since = Date.now() - 7 * 86400000;
    const summary = feedbackCollector.getSummary(since);
    return reply.send({ status: 'ok', summary });
  });

  // Dependency health
  app.get('/admin/dependencies', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    return reply.send({ status: 'ok', dependencies: depHealth?.getHealthSummary() ?? {} });
  });

  // Incidents
  app.get('/admin/incidents', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const status = (req.query as Record<string, string>).status as any;
    return reply.send({ status: 'ok', incidents: incidentDetector.getAll(status) });
  });

  logger.info('Enhancement v2 admin routes registered');
}
