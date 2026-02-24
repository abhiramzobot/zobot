/**
 * Co-Pilot Routes (Phase 2A)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CoPilotService } from './copilot-service';
import { ConversationStore } from '../memory/types';
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

export function registerCoPilotRoutes(
  app: FastifyInstance,
  copilot: CoPilotService,
  store: ConversationStore,
): void {
  /** Get co-pilot suggestions for a conversation */
  app.post('/copilot/suggest', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    const { conversationId } = req.body as { conversationId: string };
    if (!conversationId) {
      return reply.status(400).send({ error: 'Missing conversationId' });
    }

    const record = await store.get(conversationId);
    if (!record) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const suggestions = await copilot.generateSuggestions(record);
    return reply.send({ status: 'ok', suggestions });
  });

  /** Get context panel for a conversation */
  app.get('/copilot/context/:conversationId', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    const { conversationId } = req.params as { conversationId: string };
    const record = await store.get(conversationId);
    if (!record) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const panel = await copilot.buildContextPanel(record);
    return reply.send({ status: 'ok', panel });
  });

  /** Execute a smart action */
  app.post('/copilot/execute-action', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    const { conversationId, actionId } = req.body as { conversationId: string; actionId: string };
    if (!conversationId || !actionId) {
      return reply.status(400).send({ error: 'Missing conversationId or actionId' });
    }

    // For now, return the action details — actual execution is handled by the agent
    return reply.send({ status: 'ok', message: 'Action queued', conversationId, actionId });
  });

  /** Search knowledge base for agent */
  app.post('/copilot/knowledge-search', async (req, reply) => {
    if (!verifyAdminKey(req, reply)) return;

    const { query } = req.body as { query: string };
    if (!query) {
      return reply.status(400).send({ error: 'Missing query' });
    }

    const { knowledgeService } = await import('../knowledge/knowledge-service');
    const results = knowledgeService.search(query, 5);
    return reply.send({ status: 'ok', results });
  });

  logger.info('Co-Pilot routes registered');
}
