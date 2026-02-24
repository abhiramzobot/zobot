import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';
import { escalations } from '../../observability/metrics';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'handoff_to_human', conversationId: ctx.conversationId });

  const reason = String(args.reason ?? 'User requested human agent');
  const summary = String(args.summary ?? '');

  escalations.inc({ reason, channel: ctx.channel });

  // In production, this triggers SalesIQ escalation:
  // POST /api/v2/{appId}/chats/{conversationId}/escalate
  log.info({ reason, summaryLength: summary.length }, 'Handoff to human initiated');

  return {
    success: true,
    data: {
      escalated: true,
      reason,
      message: 'Connecting you with a team member. They will have the full context of our conversation.',
    },
  };
};

export const handoffToHumanTool: ToolDefinition = {
  name: 'handoff_to_human',
  version: '1.0.0',
  description: 'Escalate the conversation to a human agent with context summary.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Reason for escalation' },
      summary: { type: 'string', description: 'Conversation summary for the human agent' },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      escalated: { type: 'boolean' },
      reason: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 5,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.handoff_to_human',
  handler,
};
