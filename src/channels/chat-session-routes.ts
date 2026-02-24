import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConversationStore } from '../memory/types';
import { ChatSessionStore, CSATSubmission } from '../session/types';
import { TicketingService } from '../ticketing/types';
import { ConversationCollector } from '../learning/conversation-collector';
import { env } from '../config/env';
import { logger } from '../observability/logger';

/** POST /chat/end */
interface EndChatBody {
  conversation_id: string;
  visitor_id: string;
  ended_by?: 'user' | 'bot' | 'system';
}

/** POST /chat/feedback */
interface FeedbackBody {
  conversation_id: string;
  visitor_id: string;
  rating: number; // 1-5
  feedback?: string;
}

/**
 * Register chat session management endpoints (dev-gated).
 */
export function registerChatSessionRoutes(
  app: FastifyInstance,
  conversationStore: ConversationStore,
  sessionStore: ChatSessionStore,
  ticketing: TicketingService,
  collector?: ConversationCollector,
): void {
  if (!env.isDev) {
    logger.info('Chat session routes disabled in production');
    return;
  }

  const log = logger.child({ component: 'chat-session' });

  // ─────────────────────────────────────────────
  // POST /chat/end — End a conversation
  // ─────────────────────────────────────────────
  app.post('/chat/end', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as EndChatBody;
    const { conversation_id, visitor_id, ended_by = 'user' } = body;

    if (!conversation_id) {
      return reply.status(400).send({ error: 'conversation_id is required' });
    }

    try {
      const record = await conversationStore.get(conversation_id);
      if (!record) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // Mark as RESOLVED
      record.state = 'RESOLVED';
      record.endedAt = Date.now();
      record.endedBy = ended_by;
      record.updatedAt = Date.now();
      await conversationStore.save(record);

      // Update session index
      const firstUserTurn = record.turns.find((t) => t.role === 'user');
      await sessionStore.indexSession({
        conversationId: conversation_id,
        visitorId: visitor_id || record.visitorId || 'unknown',
        state: record.state,
        subject: firstUserTurn?.content?.slice(0, 100) || 'Chat session',
        turnCount: record.turnCount,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        endedAt: record.endedAt,
        endedBy: record.endedBy,
        csatRating: record.csatRating,
        primaryIntent: record.primaryIntent,
        ticketId: record.ticketId,
      });

      // Update ticket status (best-effort)
      if (record.ticketId) {
        try {
          await ticketing.updateTicket({
            ticketId: record.ticketId,
            status: 'Resolved',
            summary: `Chat ended by ${ended_by}. Turns: ${record.turnCount}.`,
            tags: ['dentalkart:resolved'],
          });
        } catch (err) {
          log.warn({ err, ticketId: record.ticketId }, 'Failed to update ticket on chat end');
        }
      }

      // Trigger learning collection (fire-and-forget)
      if (collector) {
        collector.collect(record, env.defaultTenantId).catch((err) =>
          log.warn({ err }, 'Learning collection failed on chat end'),
        );
      }

      log.info({ conversationId: conversation_id, endedBy: ended_by }, 'Chat ended');
      return reply.status(200).send({ success: true, state: 'RESOLVED', endedAt: record.endedAt });
    } catch (err) {
      log.error({ err }, 'Failed to end chat');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────
  // GET /chat/history/:visitorId — List past sessions
  // ─────────────────────────────────────────────
  app.get('/chat/history/:visitorId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { visitorId } = req.params as { visitorId: string };
    if (!visitorId) {
      return reply.status(400).send({ error: 'visitorId is required' });
    }

    try {
      const sessions = await sessionStore.getSessionsByVisitor(visitorId);
      return reply.status(200).send({ sessions });
    } catch (err) {
      log.error({ err }, 'Failed to get chat history');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────
  // GET /chat/transcript/:conversationId — Full transcript
  // ─────────────────────────────────────────────
  app.get('/chat/transcript/:conversationId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId is required' });
    }

    try {
      // Try full conversation first
      const record = await conversationStore.get(conversationId);
      if (record) {
        return reply.status(200).send({
          conversationId,
          state: record.state,
          turns: record.turns,
          structuredMemory: record.structuredMemory,
          turnCount: record.turnCount,
          createdAt: record.createdAt,
          endedAt: record.endedAt,
          endedBy: record.endedBy,
          csatRating: record.csatRating,
        });
      }

      // Fallback to session summary if conversation record expired
      const summary = await sessionStore.getSessionSummary(conversationId);
      if (summary) {
        return reply.status(200).send({
          conversationId,
          state: summary.state,
          turns: [],
          note: 'Full transcript expired; session summary only',
          turnCount: summary.turnCount,
          createdAt: summary.createdAt,
          endedAt: summary.endedAt,
          endedBy: summary.endedBy,
          csatRating: summary.csatRating,
        });
      }

      return reply.status(404).send({ error: 'Conversation not found' });
    } catch (err) {
      log.error({ err }, 'Failed to get transcript');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────
  // POST /chat/feedback — Submit CSAT rating
  // ─────────────────────────────────────────────
  app.post('/chat/feedback', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as FeedbackBody;
    const { conversation_id, visitor_id, rating, feedback } = body;

    if (!conversation_id || !visitor_id || !rating) {
      return reply.status(400).send({ error: 'conversation_id, visitor_id, and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return reply.status(400).send({ error: 'rating must be between 1 and 5' });
    }

    try {
      const csat: CSATSubmission = {
        conversationId: conversation_id,
        visitorId: visitor_id,
        rating,
        feedback: feedback || undefined,
        submittedAt: Date.now(),
      };

      await sessionStore.saveCSAT(csat);

      // Also update the conversation record if it still exists
      const record = await conversationStore.get(conversation_id);
      if (record) {
        record.csatRating = rating;
        record.csatFeedback = feedback || undefined;
        await conversationStore.save(record);
      }

      // Update session index with CSAT
      const summary = await sessionStore.getSessionSummary(conversation_id);
      if (summary) {
        summary.csatRating = rating;
        await sessionStore.indexSession(summary);
      }

      log.info({ conversationId: conversation_id, rating }, 'CSAT submitted');
      return reply.status(200).send({ success: true });
    } catch (err) {
      log.error({ err }, 'Failed to save CSAT feedback');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ─────────────────────────────────────────────
  // GET /chat/session/:conversationId — Get current session state
  // ─────────────────────────────────────────────
  app.get('/chat/session/:conversationId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId is required' });
    }

    try {
      const record = await conversationStore.get(conversationId);
      if (record) {
        return reply.status(200).send({
          conversationId,
          state: record.state,
          active: !['RESOLVED', 'ESCALATED'].includes(record.state),
          turnCount: record.turnCount,
          turns: record.turns,
          structuredMemory: record.structuredMemory,
          createdAt: record.createdAt,
          endedAt: record.endedAt,
        });
      }

      // Check session store
      const summary = await sessionStore.getSessionSummary(conversationId);
      if (summary) {
        return reply.status(200).send({
          conversationId,
          state: summary.state,
          active: false,
          turnCount: summary.turnCount,
          turns: [],
          createdAt: summary.createdAt,
          endedAt: summary.endedAt,
        });
      }

      return reply.status(404).send({ error: 'Session not found' });
    } catch (err) {
      log.error({ err }, 'Failed to get session state');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  logger.info('Chat session routes registered: /chat/end, /chat/history, /chat/transcript, /chat/feedback, /chat/session');
}
