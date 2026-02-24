import { ToolDefinition, ToolHandler } from '../types';
import { getLensClient } from '../../lens/lens-client';
import { logger } from '../../observability/logger';

/**
 * End AR Session Tool
 *
 * Ends an active Zoho Lens augmented reality session for the current visitor.
 * Used when the customer or bot decides to close the AR demo/troubleshooting session.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'end_ar_session', conversationId: ctx.conversationId });

  const lensClient = getLensClient();
  if (!lensClient || !lensClient.isConfigured()) {
    log.warn('Zoho Lens client not configured');
    return {
      success: false,
      error: 'AR session management is not available.',
    };
  }

  // Check for active session
  const activeSession = lensClient.getActiveSession(ctx.visitorId);
  if (!activeSession) {
    log.info({ visitorId: ctx.visitorId }, 'No active AR session to end');
    return {
      success: true,
      data: {
        ended: false,
        message: 'There is no active AR session to end.',
      },
    };
  }

  try {
    const result = await lensClient.endARDemo(ctx.visitorId);

    log.info({
      sessionId: activeSession.sessionId,
      productName: activeSession.productName,
      ended: result.ended,
    }, 'AR session end processed');

    return {
      success: true,
      data: {
        ended: result.ended,
        sessionTitle: activeSession.title,
        productName: activeSession.productName,
        duration: activeSession.createdAt
          ? Math.round((Date.now() - activeSession.createdAt) / 1000)
          : undefined,
        message: result.message,
      },
    };
  } catch (err) {
    log.error({ err, sessionId: activeSession.sessionId }, 'Failed to end AR session');
    return {
      success: false,
      error: 'Unable to end the AR session. It may have already expired.',
    };
  }
};

export const endARSessionTool: ToolDefinition = {
  name: 'end_ar_session',
  version: '1.0.0',
  description:
    'End an active augmented reality (AR) session for the customer. Use when the customer says the demo is done, wants to close the AR session, or the conversation is ending.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional reason for ending the session (e.g., "demo complete", "customer request").',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      ended: { type: 'boolean' },
      sessionTitle: { type: 'string' },
      duration: { type: 'number' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 20,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.end_ar_session',
  handler,
};
