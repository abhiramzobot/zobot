import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'update_lead', conversationId: ctx.conversationId });

  const leadId = String(args.leadId);
  const fields = (args.fields ?? {}) as Record<string, unknown>;

  // In production, this would call Zoho CRM or SalesIQ API:
  // PATCH /api/v2/{appId}/visitors/{visitorId}/leads/{leadId}
  log.info({ leadId, fieldCount: Object.keys(fields).length }, 'Lead updated');

  return {
    success: true,
    data: { leadId, updatedFields: Object.keys(fields), message: 'Lead updated successfully.' },
  };
};

export const updateLeadTool: ToolDefinition = {
  name: 'update_lead',
  version: '1.0.0',
  description: 'Update an existing lead record with new fields.',
  inputSchema: {
    type: 'object',
    properties: {
      leadId: { type: 'string', description: 'ID of the lead to update' },
      fields: {
        type: 'object',
        description: 'Key-value pairs of fields to update',
        additionalProperties: true,
      },
    },
    required: ['leadId', 'fields'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      leadId: { type: 'string' },
      updatedFields: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.update_lead',
  handler,
};
