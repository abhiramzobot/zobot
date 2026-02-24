/**
 * Analytics Routes (Phase 3B)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AnalyticsEngine } from './analytics-engine';
import { env } from '../config/env';
import { logger } from '../observability/logger';

function verifyAdminKey(req: FastifyRequest, reply: FastifyReply): boolean {
  const key = req.headers['x-admin-api-key'] as string | undefined;
  if (!key || key !== env.security.adminApiKey) {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export function registerAnalyticsRoutes(app: FastifyInstance, engine: AnalyticsEngine): void {
  app.get('/admin/analytics/dashboard', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;
    const since = parseInt((req.query as Record<string, string>).since ?? String(Date.now() - 7 * 86400000), 10);
    const data = await engine.getDashboard(since);
    return reply.send({ status: 'ok', data });
  });

  app.get('/admin/analytics/volume', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;
    const since = parseInt((req.query as Record<string, string>).since ?? String(Date.now() - 7 * 86400000), 10);
    const data = await engine.getVolumeMetrics(since, Date.now());
    return reply.send({ status: 'ok', data });
  });

  app.get('/admin/analytics/deflection', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;
    const since = parseInt((req.query as Record<string, string>).since ?? String(Date.now() - 7 * 86400000), 10);
    const data = await engine.getDeflectionMetrics(since, Date.now());
    return reply.send({ status: 'ok', data });
  });

  app.get('/admin/analytics/cost', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;
    const since = parseInt((req.query as Record<string, string>).since ?? String(Date.now() - 7 * 86400000), 10);
    const data = await engine.getCostMetrics(since, Date.now());
    return reply.send({ status: 'ok', data });
  });

  app.get('/admin/analytics/case-study', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;
    const since = parseInt((req.query as Record<string, string>).since ?? String(Date.now() - 30 * 86400000), 10);
    const data = await engine.getCaseStudyMetrics(since);
    return reply.send({ status: 'ok', data });
  });

  logger.info('Analytics routes registered');
}
