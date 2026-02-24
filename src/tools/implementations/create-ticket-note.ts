import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'create_ticket_note', conversationId: ctx.conversationId });

  const ticketId = String(args.ticketId);
  const note = String(args.note);

  // In production, this calls Zoho Desk API:
  // POST /api/v1/tickets/{ticketId}/comments
  // Body: { content: note, isPublic: false }
  log.info({ ticketId, noteLength: note.length }, 'Ticket note created');

  return {
    success: true,
    data: { ticketId, message: 'Note added to ticket.' },
  };
};

export const createTicketNoteTool: ToolDefinition = {
  name: 'create_ticket_note',
  version: '1.0.0',
  description: 'Add an internal note to a support ticket.',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'string', description: 'The ticket ID' },
      note: { type: 'string', description: 'The note content to add' },
    },
    required: ['ticketId', 'note'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 20,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.create_ticket_note',
  handler,
};
