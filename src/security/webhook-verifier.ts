import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../observability/logger';

/**
 * Verify SalesIQ webhook signature using HMAC-SHA256.
 * SalesIQ may send signature in X-Zoho-Signature header.
 * If no secret is configured, verification is skipped (dev mode).
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  const secret = env.salesiq.webhookSecret;

  if (!secret) {
    if (env.isDev) {
      logger.debug('No webhook secret configured; skipping signature verification (dev mode)');
      return true;
    }
    logger.error('No webhook secret configured in production — rejecting request');
    return false;
  }

  if (!signature) {
    logger.warn('Missing webhook signature header');
    return false;
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );

  if (!isValid) {
    logger.warn('Webhook signature mismatch');
  }

  return isValid;
}
