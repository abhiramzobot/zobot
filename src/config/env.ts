import dotenv from 'dotenv';
import path from 'path';

// Resolve .env from project root (handles running from any CWD)
const projectRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val === 'true' || val === '1';
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 3000),
  logLevel: optional('LOG_LEVEL', 'info'),

  // ───── LLM Providers ─────
  openai: {
    apiKey: optional('OPENAI_API_KEY', ''),
    model: optional('OPENAI_MODEL', 'gpt-5.2'),
    maxTokens: optionalInt('OPENAI_MAX_TOKENS', 2048),
    temperature: parseFloat(optional('OPENAI_TEMPERATURE', '0.3')),
    timeoutMs: optionalInt('OPENAI_TIMEOUT_MS', 30000),
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY', ''),
    model: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
    maxTokens: optionalInt('ANTHROPIC_MAX_TOKENS', 2048),
    temperature: parseFloat(optional('ANTHROPIC_TEMPERATURE', '0.3')),
    timeoutMs: optionalInt('ANTHROPIC_TIMEOUT_MS', 30000),
  },

  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    model: optional('GEMINI_MODEL', 'gemini-2.0-flash'),
    maxTokens: optionalInt('GEMINI_MAX_TOKENS', 2048),
    temperature: parseFloat(optional('GEMINI_TEMPERATURE', '0.3')),
    timeoutMs: optionalInt('GEMINI_TIMEOUT_MS', 30000),
  },

  // ───── LLM Routing ─────
  llm: {
    primaryProvider: optional('LLM_PRIMARY_PROVIDER', 'openai'),
    secondaryProvider: optional('LLM_SECONDARY_PROVIDER', ''),
    tertiaryProvider: optional('LLM_TERTIARY_PROVIDER', ''),
    routingStrategy: optional('LLM_ROUTING_STRATEGY', 'config'),
    abTestSplit: optionalInt('LLM_AB_TEST_SPLIT', 80),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    keyPrefix: optional('REDIS_KEY_PREFIX', 'zobot:'),
  },

  salesiq: {
    baseUrl: optional('SALESIQ_BASE_URL', 'https://salesiq.zoho.com'),
    appId: optional('SALESIQ_APP_ID', ''),
    accessToken: optional('SALESIQ_ACCESS_TOKEN', ''),
    webhookSecret: optional('SALESIQ_WEBHOOK_SECRET', ''),
    screenName: optional('SALESIQ_SCREEN_NAME', 'zobot'),
  },

  security: {
    adminApiKey: required('ADMIN_API_KEY'),
    rateLimitPerVisitor: optionalInt('RATE_LIMIT_PER_VISITOR', 30),
    rateLimitWindowSeconds: optionalInt('RATE_LIMIT_WINDOW_SECONDS', 60),
    rateLimitPerTenant: optionalInt('RATE_LIMIT_PER_TENANT', 300),
  },

  observability: {
    enableMetrics: optionalBool('ENABLE_METRICS', true),
    enableTranscripts: optionalBool('ENABLE_TRANSCRIPTS', false),
    transcriptEncryptionKey: optional('TRANSCRIPT_ENCRYPTION_KEY', ''),
  },

  rag: {
    enabled: optionalBool('RAG_ENABLED', false),
    embeddingModel: optional('RAG_EMBEDDING_MODEL', 'text-embedding-3-small'),
    topK: optionalInt('RAG_TOP_K', 5),
  },

  // ───── Dentalkart / VineRetail APIs ─────
  // VineRetail uses different API keys per endpoint
  vineretail: {
    baseUrl: optional('VINERETAIL_BASE_URL', 'https://dentalkart.vineretail.com/RestWS/api/eretail/v1'),
    apiKey: optional('VINERETAIL_API_KEY', ''),
    apiOwner: optional('VINERETAIL_API_OWNER', ''),
    // Per-endpoint overrides (falls back to the main apiKey if not set)
    customerOrderApiKey: optional('VINERETAIL_CUSTOMER_ORDER_API_KEY', ''),
    shipmentDetailApiKey: optional('VINERETAIL_SHIPMENT_DETAIL_API_KEY', ''),
    shipDetailApiKey: optional('VINERETAIL_SHIP_DETAIL_API_KEY', ''),
  },

  clickpost: {
    baseUrl: optional('CLICKPOST_BASE_URL', 'https://api.clickpost.in/api/v2'),
    apiKey: optional('CLICKPOST_API_KEY', ''),
    username: optional('CLICKPOST_USERNAME', 'dentalkart'),
  },

  dentalkartAdmin: {
    baseUrl: optional('DENTALKART_ADMIN_BASE_URL', 'https://adminapis.dentalkart.com'),
    apiKey: optional('DENTALKART_ADMIN_API_KEY', ''),
  },

  dentalkartSearch: {
    baseUrl: optional('DENTALKART_SEARCH_BASE_URL', 'https://search-staging.dentalkart.com/api/v1'),
  },

  // ───── Learning Pipeline ─────
  learning: {
    enabled: optionalBool('LEARNING_ENABLED', true),
    pipelineIntervalHours: optionalInt('LEARNING_PIPELINE_INTERVAL_HOURS', 24),
  },

  // ───── PII Governance ─────
  pii: {
    enabled: optionalBool('PII_ENABLED', true),
    encryptionKey: optional('PII_ENCRYPTION_KEY', 'default-dev-key-change-in-prod'),
    purgeOnConversationEnd: optionalBool('PII_PURGE_ON_CONVERSATION_END', true),
  },

  // ───── Chat Session Management ─────
  chat: {
    sessionTtlDays: optionalInt('CHAT_SESSION_TTL_DAYS', 90),
    maxHistoryPerVisitor: optionalInt('CHAT_MAX_HISTORY_PER_VISITOR', 50),
    csatEnabled: optionalBool('CHAT_CSAT_ENABLED', true),
    autoGreetingEnabled: optionalBool('CHAT_AUTO_GREETING_ENABLED', true),
    maxUploadSizeMb: optionalInt('CHAT_MAX_UPLOAD_SIZE_MB', 10),
    uploadDir: optional('CHAT_UPLOAD_DIR', 'uploads'),
  },

  // ───── Enhancement v4: Zoho Lens AR ─────
  zohoLens: {
    enabled: optionalBool('ZOHO_LENS_ENABLED', false),
    baseUrl: optional('ZOHO_LENS_BASE_URL', 'https://lens.zoho.com'),
    accountsUrl: optional('ZOHO_LENS_ACCOUNTS_URL', 'https://accounts.zoho.com'),
    clientId: optional('ZOHO_LENS_CLIENT_ID', ''),
    clientSecret: optional('ZOHO_LENS_CLIENT_SECRET', ''),
    refreshToken: optional('ZOHO_LENS_REFRESH_TOKEN', ''),
    departmentId: optional('ZOHO_LENS_DEPARTMENT_ID', ''),
    technicianEmail: optional('ZOHO_LENS_TECHNICIAN_EMAIL', ''),
  },

  // ───── Enhancement v2: Razorpay Payments ─────
  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID', ''),
    keySecret: optional('RAZORPAY_KEY_SECRET', ''),
  },

  // ───── Enhancement v2: SLA ─────
  sla: {
    enabled: optionalBool('SLA_ENABLED', false),
    defaultTier: optional('SLA_DEFAULT_TIER', 'silver'),
  },

  // ───── Enhancement v2: Outbound ─────
  outbound: {
    enabled: optionalBool('OUTBOUND_ENABLED', false),
    maxPerDay: optionalInt('OUTBOUND_MAX_PER_DAY', 3),
    quietHoursStart: optionalInt('OUTBOUND_QUIET_START', 21),
    quietHoursEnd: optionalInt('OUTBOUND_QUIET_END', 9),
  },

  // ───── Enhancement v2: Customer 360 ─────
  customer360: {
    enabled: optionalBool('CUSTOMER_360_ENABLED', false),
    cacheTtlSeconds: optionalInt('CUSTOMER_360_CACHE_TTL', 300),
  },

  // ───── Enhancement v5: Cart Abandonment Recovery ─────
  cartAbandonment: {
    enabled: optionalBool('CART_ABANDONMENT_ENABLED', false),
    abandonmentDelayMinutes: optionalInt('CART_ABANDONMENT_DELAY_MINUTES', 30),
    checkIntervalMinutes: optionalInt('CART_ABANDONMENT_CHECK_INTERVAL', 5),
    recoveryCouponPercent: optionalInt('CART_RECOVERY_COUPON_PERCENT', 10),
    recoveryCouponExpiryHours: optionalInt('CART_RECOVERY_COUPON_EXPIRY_HOURS', 24),
  },

  // ───── Enhancement v5: Dynamic Tone Adjustment ─────
  dynamicTone: {
    enabled: optionalBool('DYNAMIC_TONE_ENABLED', true),
    empatheticThreshold: parseFloat(optional('TONE_EMPATHETIC_THRESHOLD', '-0.3')),
    positiveThreshold: parseFloat(optional('TONE_POSITIVE_THRESHOLD', '0.5')),
  },

  defaultTenantId: optional('DEFAULT_TENANT_ID', 'default'),

  get isDev(): boolean {
    return this.nodeEnv === 'development' || this.nodeEnv === 'test';
  },
  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
} as const;
