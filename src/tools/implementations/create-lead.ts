import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'create_lead', conversationId: ctx.conversationId });

  const lead = {
    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(args.name ?? ''),
    email: String(args.email ?? ''),
    phone: String(args.phone ?? ''),
    company: String(args.company ?? ''),
    intent: String(args.intent ?? ''),
    source: `zobot-${ctx.channel}`,
    conversationId: ctx.conversationId,
    createdAt: new Date().toISOString(),
  };

  // In production, this would call Zoho CRM or SalesIQ lead API:
  // POST /api/v2/{appId}/visitors/{visitorId}/leads
  log.info({ leadId: lead.id, name: lead.name }, 'Lead created');

  return {
    success: true,
    data: { leadId: lead.id, message: 'Lead created successfully.' },
  };
};

export const createLeadTool: ToolDefinition = {
  name: 'create_lead',
  version: '1.0.0',
  description: 'Create a new lead/contact record with visitor information.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Full name of the lead' },
      email: { type: 'string', description: 'Email address' },
      phone: { type: 'string', description: 'Phone number' },
      company: { type: 'string', description: 'Company name' },
      intent: { type: 'string', description: 'Detected intent or interest' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      leadId: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.create_lead',
  handler,
};
