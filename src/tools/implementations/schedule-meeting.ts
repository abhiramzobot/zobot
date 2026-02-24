import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'schedule_meeting', conversationId: ctx.conversationId });

  const preferredTimes = args.preferredTimes as string[] | undefined;
  const timezone = String(args.timezone ?? 'UTC');

  // In production, integrate with Zoho Calendar / Zoho Bookings:
  // POST /api/v1/bookings
  // For now, return a handoff suggestion since no calendar is integrated.

  if (!preferredTimes || preferredTimes.length === 0) {
    log.info('No preferred times provided; suggesting handoff');
    return {
      success: true,
      data: {
        scheduled: false,
        message: 'No calendar integration available. A team member will reach out to schedule a meeting.',
        fallbackAction: 'handoff',
      },
    };
  }

  log.info({ preferredTimes, timezone }, 'Meeting scheduling attempted');

  return {
    success: true,
    data: {
      scheduled: false,
      preferredTimes,
      timezone,
      message: 'Your preferred times have been noted. A team member will confirm the meeting shortly.',
      fallbackAction: 'handoff',
    },
  };
};

export const scheduleMeetingTool: ToolDefinition = {
  name: 'schedule_meeting',
  version: '1.0.0',
  description: 'Schedule a meeting with preferred times and timezone. Falls back to handoff if no calendar is integrated.',
  inputSchema: {
    type: 'object',
    properties: {
      preferredTimes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Preferred meeting times (ISO 8601 or human-readable)',
      },
      timezone: { type: 'string', description: 'Timezone of the visitor (e.g., America/New_York)' },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      scheduled: { type: 'boolean' },
      preferredTimes: { type: 'array' },
      timezone: { type: 'string' },
      message: { type: 'string' },
      fallbackAction: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 5,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.schedule_meeting',
  handler,
};
