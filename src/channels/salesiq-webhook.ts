import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { parseSalesIQWebhook } from './salesiq-adapter';
import { SalesIQWebhookPayload } from './types';
import { verifyWebhookSignature } from '../security/webhook-verifier';
import { visitorRateLimiter, tenantRateLimiter } from '../security/rate-limiter';
import { abuseDetector } from '../security/abuse-detector';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { messagesProcessed, httpRequestDuration, webhookDuplicatesTotal } from '../observability/metrics';
import { createTraceContext } from '../observability/trace';
import { Orchestrator } from '../orchestrator/orchestrator';
import { createHash } from 'crypto';
import { DedupStore } from '../security/dedup-store';

let _dedupStore: DedupStore | undefined;

export function setDedupStore(store: DedupStore): void {
  _dedupStore = store;
}

export function registerSalesIQWebhook(app: FastifyInstance, orchestrator: Orchestrator): void {
  app.post('/webhooks/salesiq', {
    config: { rawBody: true } as any,
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const timer = httpRequestDuration.startTimer({ method: 'POST', route: '/webhooks/salesiq' });
    const trace = createTraceContext();
    const log = logger.child({ requestId: trace.requestId });

    try {
      // 1. Signature verification
      const signature = req.headers['x-zoho-signature'] as string | undefined;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature)) {
        timer({ status_code: '401' });
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      // 2. Parse payload
      const payload = req.body as SalesIQWebhookPayload;
      const tenantId = (req.headers['x-tenant-id'] as string) || env.defaultTenantId;
      const parseResult = parseSalesIQWebhook(payload, tenantId);

      if (!parseResult.ok) {
        log.warn({ reason: parseResult.reason }, 'Failed to parse webhook');
        timer({ status_code: '400' });
        return reply.status(400).send({ error: parseResult.reason });
      }

      const inbound = parseResult.message;
      trace.conversationId = inbound.conversationId;
      trace.channel = inbound.channel;
      trace.tenantId = tenantId;

      // 3. Rate limiting
      const visitorCheck = visitorRateLimiter.check(`visitor:${inbound.visitorId}`);
      if (!visitorCheck.allowed) {
        timer({ status_code: '429' });
        return reply.status(429).send({
          error: 'Rate limit exceeded',
          retryAfterMs: visitorCheck.retryAfterMs,
        });
      }

      const tenantCheck = tenantRateLimiter.check(`tenant:${tenantId}`);
      if (!tenantCheck.allowed) {
        timer({ status_code: '429' });
        return reply.status(429).send({
          error: 'Tenant rate limit exceeded',
          retryAfterMs: tenantCheck.retryAfterMs,
        });
      }

      // 4. Abuse detection
      const abuseCheck = abuseDetector.check(inbound.visitorId, inbound.message.text);
      if (abuseCheck.blocked) {
        log.warn({ visitorId: inbound.visitorId, reason: abuseCheck.reason }, 'Message blocked');
        timer({ status_code: '200' });
        return reply.status(200).send({ status: 'blocked', reason: abuseCheck.reason });
      }

      // 4b. Webhook deduplication (Enhancement v2)
      if (_dedupStore) {
        const msgHash = createHash('md5').update(inbound.message.text).digest('hex').substring(0, 12);
        const dedupKey = `${inbound.conversationId}:${msgHash}`;
        const isNew = await _dedupStore.isNew(dedupKey);
        if (!isNew) {
          log.info({ dedupKey }, 'Duplicate webhook detected; skipping');
          webhookDuplicatesTotal.inc();
          timer({ status_code: '200' });
          return reply.status(200).send({ status: 'duplicate', requestId: trace.requestId });
        }
      }

      // 5. Track metrics
      messagesProcessed.inc({ channel: inbound.channel, tenant: tenantId });

      // 6. Hand off to orchestrator (async processing)
      // We respond 200 immediately and process asynchronously to avoid webhook timeouts
      orchestrator.handleMessage(inbound, trace).catch((err) => {
        log.error({ err, conversationId: inbound.conversationId }, 'Orchestrator error');
      });

      timer({ status_code: '200' });
      return reply.status(200).send({ status: 'accepted', requestId: trace.requestId });
    } catch (err) {
      log.error({ err }, 'Webhook handler error');
      timer({ status_code: '500' });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
