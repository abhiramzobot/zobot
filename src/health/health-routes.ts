import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { AgentCore } from '../agent/agent-core';
import { env } from '../config/env';
import { getMetrics, getContentType } from '../observability/metrics';
import { getDependencyHealth } from '../resilience/dependency-health';

export function registerHealthRoutes(app: FastifyInstance, redis?: Redis, agent?: AgentCore): void {
  /** Liveness probe — always returns 200 if the process is running */
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /** Readiness probe — checks Redis and all configured LLM providers */
  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    // Check Redis
    if (redis) {
      const start = Date.now();
      try {
        await redis.ping();
        checks.redis = { status: 'ok', latencyMs: Date.now() - start };
      } catch {
        checks.redis = { status: 'error', latencyMs: Date.now() - start };
      }
    } else {
      checks.redis = { status: 'skipped' };
    }

    // Check LLM providers (multi-provider health check)
    if (agent) {
      try {
        const providerChecks = await agent.healthCheck();
        for (const [providerName, check] of Object.entries(providerChecks)) {
          checks[`llm_${providerName}`] = check;
        }
      } catch {
        checks.llm = { status: 'error' };
      }
    } else {
      checks.llm = { status: 'skipped' };
    }

    // Check dependency health (Enhancement v2)
    const depHealth = getDependencyHealth();
    if (depHealth) {
      const depSummary = depHealth.getHealthSummary();
      for (const [name, health] of Object.entries(depSummary)) {
        checks[`dep_${name}`] = {
          status: health.status === 'healthy' ? 'ok' : 'error',
        };
      }
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'skipped');
    const statusCode = allOk ? 200 : 503;

    return reply.status(statusCode).send({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      degradationLevel: depHealth?.getDegradationLevel() ?? 'none',
      timestamp: new Date().toISOString(),
    });
  });

  /** Prometheus metrics endpoint */
  if (env.observability.enableMetrics) {
    app.get('/metrics', async (_req, reply) => {
      const metrics = await getMetrics();
      reply.header('Content-Type', getContentType());
      return reply.send(metrics);
    });
  }
}
