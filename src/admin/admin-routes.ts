import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { configService } from '../config/config-service';
import { promptManager } from '../agent/prompt-manager';
import { knowledgeService } from '../knowledge/knowledge-service';
import { logger } from '../observability/logger';
import { LearningStore } from '../learning/learning-store';
import { LearningScheduler } from '../learning/scheduler';
import { KnowledgeUpdater } from '../learning/knowledge-updater';
import { PromptTracker } from '../learning/prompt-tracker';
import { VOCStore } from '../voc/voc-store';
import { VOCPreProcessor } from '../voc/pre-processor';
import { VOCEvaluator } from '../voc/evaluation/evaluator';
import { EvalCase } from '../voc/evaluation/types';
import { faqCandidatesPending } from '../observability/metrics';

function verifyAdminKey(req: FastifyRequest, reply: FastifyReply): boolean {
  const key = req.headers['x-admin-api-key'] as string | undefined;
  if (!key || key !== env.security.adminApiKey) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

interface LearningDeps {
  store: LearningStore;
  scheduler: LearningScheduler;
  knowledgeUpdater: KnowledgeUpdater;
  promptTracker: PromptTracker;
  vocStore?: VOCStore;
}

export function registerAdminRoutes(app: FastifyInstance, learningDeps?: LearningDeps): void {
  /** Reload all configuration (tenant configs, prompts, knowledge) */
  app.post('/admin/reload-config', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      configService.loadAll();
      promptManager.loadAll();
      knowledgeService.loadAll();

      logger.info({ admin: true }, 'Configuration reloaded');
      return reply.send({ status: 'ok', message: 'All configurations reloaded' });
    } catch (err) {
      logger.error({ err }, 'Config reload failed');
      return reply.status(500).send({ error: 'Reload failed' });
    }
  });

  /** Get redacted tenant config */
  app.get('/admin/config/:tenantId', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    const { tenantId } = req.params as { tenantId: string };
    const config = configService.getRedacted(tenantId);
    return reply.send(config);
  });

  // ───── Learning Pipeline Admin Endpoints ────────────────────────
  if (!learningDeps) return;

  const { store, scheduler, knowledgeUpdater, promptTracker } = learningDeps;

  /** Get latest learning analysis report */
  app.get('/admin/learning/report', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const sinceParam = (req.query as Record<string, string>).since;
      const since = sinceParam ? parseInt(sinceParam, 10) : Date.now() - 24 * 60 * 60 * 1000;

      const summaryCount = await store.getSummaryCount(since);
      const faqCandidates = await store.getFAQCandidates('pending');
      const promptReport = await promptTracker.getPromptReport(since);
      const providerReport = await promptTracker.getProviderReport(since);

      // Get latest artifacts by type
      const artifactTypes = ['faq_discovery', 'knowledge_gap', 'escalation_pattern', 'response_quality', 'intent_pattern'] as const;
      const latestArtifacts: Record<string, unknown[]> = {};

      for (const type of artifactTypes) {
        const artifacts = await store.getArtifacts(type, since);
        latestArtifacts[type] = artifacts.slice(0, 5).map((a) => a.data);
      }

      return reply.send({
        status: 'ok',
        period: {
          since: new Date(since).toISOString(),
          until: new Date().toISOString(),
        },
        conversationSummaries: summaryCount,
        pendingFAQCandidates: faqCandidates.length,
        promptEffectiveness: promptReport,
        providerComparison: providerReport,
        latestArtifacts,
        pipelineRunning: scheduler.isRunning(),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to generate learning report');
      return reply.status(500).send({ error: 'Failed to generate report' });
    }
  });

  /** List pending FAQ candidates */
  app.get('/admin/learning/faq-candidates', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const statusParam = (req.query as Record<string, string>).status as 'pending' | 'approved' | 'rejected' | undefined;
      const candidates = await store.getFAQCandidates(statusParam || 'pending');

      faqCandidatesPending.set(
        (await store.getFAQCandidates('pending')).length,
      );

      return reply.send({
        status: 'ok',
        count: candidates.length,
        candidates,
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to fetch FAQ candidates' });
    }
  });

  /** Approve a FAQ candidate */
  app.post('/admin/learning/faq-candidates/:id/approve', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const { id } = req.params as { id: string };
      await store.updateFAQCandidateStatus(id, 'approved');
      return reply.send({ status: 'ok', message: `FAQ candidate ${id} approved` });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to approve candidate' });
    }
  });

  /** Reject a FAQ candidate */
  app.post('/admin/learning/faq-candidates/:id/reject', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const { id } = req.params as { id: string };
      await store.updateFAQCandidateStatus(id, 'rejected');
      return reply.send({ status: 'ok', message: `FAQ candidate ${id} rejected` });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to reject candidate' });
    }
  });

  /** Trigger an ad-hoc learning pipeline run */
  app.post('/admin/learning/run', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      if (scheduler.isRunning()) {
        return reply.status(409).send({ error: 'Pipeline already running' });
      }

      // Fire and don't wait
      scheduler.triggerRun().catch((err) =>
        logger.error({ err }, 'Ad-hoc pipeline run failed'),
      );

      return reply.send({ status: 'ok', message: 'Learning pipeline triggered' });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to trigger pipeline' });
    }
  });

  /** Get multi-LLM provider comparison */
  app.get('/admin/learning/provider-comparison', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const sinceParam = (req.query as Record<string, string>).since;
      const since = sinceParam ? parseInt(sinceParam, 10) : Date.now() - 7 * 24 * 60 * 60 * 1000;

      const report = await promptTracker.getProviderReport(since);
      return reply.send({
        status: 'ok',
        period: {
          since: new Date(since).toISOString(),
          until: new Date().toISOString(),
        },
        providers: report,
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to generate provider comparison' });
    }
  });

  /** Generate knowledge base patch from approved FAQs */
  app.get('/admin/learning/knowledge-patch', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const patch = await knowledgeUpdater.generatePatch();
      const approvedCount = await knowledgeUpdater.getApprovedCount();

      return reply.send({
        status: 'ok',
        approvedCount,
        patch,
      });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to generate knowledge patch' });
    }
  });

  // ───── VOC Analytics Endpoints ─────────────────────────────────
  const vocStore = learningDeps.vocStore;

  /** Get VOC analytics dashboard data */
  app.get('/admin/voc/analytics', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const sinceParam = (req.query as Record<string, string>).since;
      const since = sinceParam ? parseInt(sinceParam, 10) : Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Get VOC-related artifacts
      const sentimentArtifacts = await store.getArtifacts('sentiment_trend', since);
      const vocQualityArtifacts = await store.getArtifacts('voc_quality', since);

      // Get latest of each type
      const latestSentiment = sentimentArtifacts[sentimentArtifacts.length - 1]?.data;
      const latestQuality = vocQualityArtifacts[vocQualityArtifacts.length - 1]?.data;

      return reply.send({
        status: 'ok',
        period: {
          since: new Date(since).toISOString(),
          until: new Date().toISOString(),
        },
        sentimentTrend: latestSentiment ?? null,
        vocQuality: latestQuality ?? null,
        artifactCounts: {
          sentimentTrend: sentimentArtifacts.length,
          vocQuality: vocQualityArtifacts.length,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to generate VOC analytics');
      return reply.status(500).send({ error: 'Failed to generate VOC analytics' });
    }
  });

  /** Get VOC records for a specific conversation */
  app.get('/admin/voc/conversation/:conversationId', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    if (!vocStore) {
      return reply.status(503).send({ error: 'VOC store not available' });
    }

    try {
      const { conversationId } = req.params as { conversationId: string };
      const records = await vocStore.getByConversation(conversationId);

      return reply.send({
        status: 'ok',
        conversationId,
        recordCount: records.length,
        records,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch VOC conversation records');
      return reply.status(500).send({ error: 'Failed to fetch VOC records' });
    }
  });

  // ───── VOC Evaluation Endpoint ─────────────────────────────────

  /** Run VOC evaluation suite */
  app.post('/admin/voc/evaluate', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    try {
      const body = req.body as { cases?: EvalCase[]; runLLM?: boolean } | undefined;
      let cases: EvalCase[];

      if (body?.cases && Array.isArray(body.cases)) {
        cases = body.cases;
      } else {
        // Load default test suite
        const fs = await import('fs');
        const path = await import('path');
        const suitePath = path.join(process.cwd(), 'tests', 'evaluation', 'voc-eval-suite.json');
        cases = JSON.parse(fs.readFileSync(suitePath, 'utf-8')) as EvalCase[];
      }

      const preProcessor = new VOCPreProcessor();
      const evaluator = new VOCEvaluator(preProcessor);
      const report = await evaluator.evaluate(cases, body?.runLLM ?? false);

      return reply.send({
        status: 'ok',
        report,
      });
    } catch (err) {
      logger.error({ err }, 'VOC evaluation failed');
      return reply.status(500).send({ error: 'Evaluation failed' });
    }
  });

  logger.info('Learning + VOC admin endpoints registered');
}
