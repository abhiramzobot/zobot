import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentCore } from '../agent/agent-core';
import { ConversationStore } from '../memory/types';
import { ConversationRecord } from '../memory/types';
import { ChatSessionStore } from '../session/types';
import { stateMachine } from '../orchestrator/state-machine';
import { toolRuntime } from '../tools/runtime';
import { ToolContext } from '../tools/types';
import { mergeStructuredMemory } from '../memory/conversation-memory';
import { configService } from '../config/config-service';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { Channel, StructuredMemory } from '../config/types';

interface TestChatBody {
  message: string;
  conversation_id?: string;
  visitor_id?: string;
  visitor_name?: string;
  visitor_phone?: string;
  visitor_email?: string;
  channel?: Channel;
}

/**
 * Synchronous test chat endpoint for local development.
 * POST /test/chat
 *
 * Unlike the webhook (which processes async and replies via SalesIQ),
 * this endpoint processes the message synchronously and returns the
 * full bot response directly in the HTTP response body.
 */
export function registerTestChatEndpoint(app: FastifyInstance, store: ConversationStore, agent: AgentCore, sessionStore?: ChatSessionStore): void {
  app.post('/test/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as TestChatBody;
    const log = logger.child({ component: 'test-chat' });

    const message = String(body.message ?? '').trim();
    if (!message) {
      return reply.status(400).send({ error: 'message is required' });
    }

    const conversationId = body.conversation_id ?? `test-${Date.now()}`;
    const channel: Channel = body.channel ?? 'web';
    const tenantId = env.defaultTenantId;
    const visitorId = body.visitor_id ?? `test-visitor-${conversationId}`;

    try {
      // 1. Load or create conversation
      let record = await store.get(conversationId);
      const isNew = !record;

      if (!record) {
        record = {
          conversationId,
          state: 'NEW',
          turns: [],
          structuredMemory: {
            name: body.visitor_name,
            email: body.visitor_email,
            phone: body.visitor_phone,
            customFields: {},
          },
          ticketId: undefined,
          clarificationCount: 0,
          turnCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          visitorId,
        };
      }

      // 2. Add user turn
      record.turns.push({
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });
      record.turnCount++;

      // 3. Merge visitor info
      if (body.visitor_name) record.structuredMemory.name = body.visitor_name;
      if (body.visitor_email) record.structuredMemory.email = body.visitor_email;
      if (body.visitor_phone) record.structuredMemory.phone = body.visitor_phone;

      // 4. Call agent core (routed through ModelRouter)
      const tenantConfig = configService.get(tenantId);
      const agentResponse = await agent.process(
        message,
        record.turns,
        record.structuredMemory,
        channel,
        tenantConfig.promptVersion,
        `test-${Date.now()}`,
      );

      // 5. State transition
      const targetState = stateMachine.resolveTargetState(
        record.state,
        agentResponse.intent,
        agentResponse.shouldEscalate,
      );
      const previousState = record.state;
      const { newState } = stateMachine.transition(
        conversationId,
        record.state,
        targetState,
        agentResponse.intent,
      );
      record.state = newState;

      // 6. Execute tool calls
      const toolCtx: ToolContext = {
        tenantId,
        channel,
        conversationId,
        visitorId,
        requestId: `test-${Date.now()}`,
      };

      const toolResults: Array<{ tool: string; success: boolean; data?: unknown; error?: string }> = [];

      for (const toolCall of agentResponse.toolCalls) {
        try {
          const result = await toolRuntime.execute(toolCall.name, toolCall.args, toolCtx);
          toolResults.push({
            tool: toolCall.name,
            success: result.success,
            data: result.data,
            error: result.error,
          });
        } catch (err) {
          toolResults.push({
            tool: toolCall.name,
            success: false,
            error: String(err),
          });
        }
      }

      // 6b. TOOL RESULT FEEDBACK LOOP
      // Feed tool results (successes AND failures) back to the LLM so it can
      // present actual data or correct its message when tools fail.
      let finalBotMessage = agentResponse.userFacingMessage;
      let finalIntent = agentResponse.intent;
      let finalExtractedFields = agentResponse.extractedFields;

      const hasToolResults = toolResults.length > 0;
      if (hasToolResults && agentResponse.toolCalls.length > 0) {
        log.info({ toolCount: toolResults.length }, 'Feeding tool results back to LLM');

        try {
          const refinedResponse = await agent.processWithToolResults(
            message,
            record.turns.slice(0, -1), // history WITHOUT the latest user turn
            record.structuredMemory,
            channel,
            toolResults,
            agentResponse.userFacingMessage,
            tenantConfig.promptVersion,
            `test-refined-${Date.now()}`,
          );

          finalBotMessage = refinedResponse.userFacingMessage;
          finalIntent = refinedResponse.intent || agentResponse.intent;
          finalExtractedFields = {
            ...agentResponse.extractedFields,
            ...refinedResponse.extractedFields,
          };

          if (refinedResponse.shouldEscalate) {
            agentResponse.shouldEscalate = true;
            agentResponse.escalationReason = refinedResponse.escalationReason;
          }
        } catch (refinedErr) {
          log.error({ err: refinedErr }, 'Failed to refine response with tool results');
        }
      }

      // 7. Merge extracted fields
      record.structuredMemory = mergeStructuredMemory(
        record.structuredMemory,
        finalExtractedFields,
      );

      // 8. Add assistant turn
      record.turns.push({
        role: 'assistant',
        content: finalBotMessage,
        timestamp: Date.now(),
      });

      // 9. Save conversation
      record.primaryIntent = record.primaryIntent || finalIntent;
      await store.save(record);

      // 9b. Index session for history
      if (sessionStore) {
        const firstUserTurn = record.turns.find((t) => t.role === 'user');
        sessionStore.indexSession({
          conversationId,
          visitorId,
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
        }).catch((err) => log.warn({ err }, 'Session index failed'));
      }

      // 10. Return full response
      return reply.status(200).send({
        conversationId,
        isNewConversation: isNew,
        state: {
          previous: previousState,
          current: newState,
        },
        intent: finalIntent,
        botMessage: finalBotMessage,
        extractedFields: finalExtractedFields,
        shouldEscalate: agentResponse.shouldEscalate,
        escalationReason: agentResponse.escalationReason,
        toolCalls: agentResponse.toolCalls.map((tc) => ({
          name: tc.name,
          args: tc.args,
        })),
        toolResults,
        turnCount: record.turnCount,
      });
    } catch (err) {
      log.error({ err }, 'Test chat error');
      return reply.status(500).send({ error: 'Internal error', details: String(err) });
    }
  });

  logger.info('Test chat endpoint registered: POST /test/chat');
}
