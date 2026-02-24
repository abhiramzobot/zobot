/**
 * Generate Payment Link Tool (Phase 4A)
 *
 * Creates Razorpay payment links for in-chat collection.
 */

import { ToolDefinition, ToolResult } from '../types';
import { logger } from '../../observability/logger';

export const generatePaymentLinkTool: ToolDefinition = {
  name: 'generate_payment_link',
  version: '1.0.0',
  description: 'Generate a secure payment link for in-chat payment collection. NEVER accept card numbers in chat — always use payment links.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Order ID for this payment' },
      amount: { type: 'number', description: 'Amount in INR' },
      description: { type: 'string', description: 'Payment description' },
      customerName: { type: 'string', description: 'Customer name' },
      customerPhone: { type: 'string', description: 'Customer phone number' },
      customerEmail: { type: 'string', description: 'Customer email (optional)' },
    },
    required: ['orderId', 'amount', 'description', 'customerName'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      paymentLink: { type: 'string' },
      linkId: { type: 'string' },
      expiresAt: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 5,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tools.generate_payment_link',
  cacheable: false,
  retryable: true,
  retryDelayMs: 3000,

  handler: async (args): Promise<ToolResult> => {
    const { orderId, amount, description, customerName, customerPhone, customerEmail } = args as {
      orderId: string; amount: number; description: string; customerName: string;
      customerPhone?: string; customerEmail?: string;
    };
    const log = logger.child({ tool: 'generate_payment_link', orderId });

    try {
      // In production: use RazorpayClient
      // For now, generate a mock link
      const linkId = `pay_${Date.now()}_${orderId}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      log.info({ amount, customerName }, 'Payment link generated');

      return {
        success: true,
        data: {
          paymentLink: `https://rzp.io/i/${linkId}`,
          linkId,
          amount,
          expiresAt,
          message: `Here's your secure payment link for ₹${amount}: https://rzp.io/i/${linkId}\n\nThis link is valid for 24 hours. Please complete the payment to proceed with your order.`,
        },
      };
    } catch (err) {
      log.error({ err }, 'Payment link generation failed');
      return { success: false, error: 'Failed to generate payment link. Please try again.' };
    }
  },
};
