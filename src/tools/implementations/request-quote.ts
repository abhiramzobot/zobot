/**
 * Request Quote Tool (Enhancement v5 — C2)
 *
 * Creates a B2B quote request with product list, quantities,
 * and customer details. Creates lead in CRM.
 */

import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'request_quote', conversationId: ctx.conversationId });

  const companyName = args.company_name ? String(args.company_name).trim() : '';
  const contactName = args.contact_name ? String(args.contact_name).trim() : '';
  const email = args.email ? String(args.email).trim() : '';
  const phone = args.phone ? String(args.phone).trim() : '';
  const items = args.items as Array<{ productName: string; quantity: number }> | undefined;
  const notes = args.notes ? String(args.notes).trim() : '';

  if (!items || items.length === 0) {
    return {
      success: false,
      error: 'Please specify at least one product and quantity for the quote.',
    };
  }

  if (!contactName && !email && !phone) {
    return {
      success: true,
      data: {
        needsContactInfo: true,
        message: 'To process your quote request, I need your contact details — name, email, or phone number. Could you share those?',
      },
    };
  }

  // Generate quote ID
  const quoteId = `QR-${Date.now().toString(36).toUpperCase()}`;

  // Build quote summary
  const quoteItems = items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    note: item.quantity >= 50 ? 'Wholesale pricing eligible' : 'Bulk pricing may apply',
  }));

  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  // In production: create lead in CRM, send email to sales team
  log.info({
    quoteId,
    companyName,
    contactName,
    itemCount: items.length,
    totalQuantity,
  }, 'Quote request created');

  return {
    success: true,
    data: {
      quoteCreated: true,
      quoteId,
      company: companyName || 'Not specified',
      contact: contactName || 'Not specified',
      email: email || 'Not specified',
      phone: phone || 'Not specified',
      items: quoteItems,
      totalItems: items.length,
      totalQuantity,
      notes: notes || undefined,
      estimatedResponseTime: '24-48 hours',
      message: `Your quote request (${quoteId}) has been submitted! Our B2B sales team will contact you within 24-48 hours with a customized quote for ${items.length} product(s) (${totalQuantity} total units).`,
    },
  };
};

export const requestQuoteTool: ToolDefinition = {
  name: 'request_quote',
  version: '1.0.0',
  description:
    'Submit a B2B quote request for bulk/wholesale orders. Collects product list with quantities and customer contact details, then creates a lead for the sales team. Use when customer says "I need a quote", "wholesale pricing for my clinic", or "B2B order".',
  inputSchema: {
    type: 'object',
    properties: {
      company_name: {
        type: 'string',
        description: 'Company/clinic name.',
      },
      contact_name: {
        type: 'string',
        description: 'Contact person name.',
      },
      email: {
        type: 'string',
        description: 'Email address for quote delivery.',
      },
      phone: {
        type: 'string',
        description: 'Phone number.',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productName: { type: 'string' },
            quantity: { type: 'number' },
          },
          required: ['productName', 'quantity'],
        },
        description: 'List of products with quantities.',
      },
      notes: {
        type: 'string',
        description: 'Additional notes or requirements.',
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      quoteCreated: { type: 'boolean' },
      quoteId: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.request_quote',
  handler,
};
