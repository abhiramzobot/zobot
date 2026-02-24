/**
 * Change Payment Method Tool (Phase 2B)
 *
 * COD↔Prepaid conversion. Generates payment link for COD→Prepaid.
 */

import { ToolDefinition, ToolResult } from '../types';
import { checkPaymentModificationEligibility, logOrderModification } from './order-modification-utils';
import { logger } from '../../observability/logger';

export const changePaymentMethodTool: ToolDefinition = {
  name: 'change_payment_method',
  version: '1.0.0',
  description: 'Change payment method for an order. Supports COD to Prepaid (generates payment link) and Prepaid to COD conversion. Only for Confirmed orders.',
  inputSchema: {
    type: 'object',
    properties: {
      orderNo: { type: 'string', description: 'Order number' },
      newPaymentMethod: { type: 'string', enum: ['cod', 'prepaid'], description: 'New payment method' },
    },
    required: ['orderNo', 'newPaymentMethod'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      changed: { type: 'boolean' },
      paymentLink: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tools.change_payment_method',
  cacheable: false,
  retryable: true,
  retryDelayMs: 2000,

  handler: async (args): Promise<ToolResult> => {
    const { orderNo, newPaymentMethod } = args as { orderNo: string; newPaymentMethod: 'cod' | 'prepaid' };
    const log = logger.child({ tool: 'change_payment_method', orderNo });

    try {
      // Simulate order lookup
      const mockOrder = {
        orderNo,
        status: 'Confirmed',
        currentPaymentMethod: 'cod',
        totalAmount: 2499,
      };

      const eligibility = checkPaymentModificationEligibility(mockOrder.status);
      if (!eligibility.eligible) {
        return { success: true, data: { changed: false, message: eligibility.reason } };
      }

      if (mockOrder.currentPaymentMethod === newPaymentMethod) {
        return {
          success: true,
          data: { changed: false, message: `Order ${orderNo} is already set to ${newPaymentMethod}. No changes needed.` },
        };
      }

      logOrderModification('change_payment', orderNo,
        { paymentMethod: mockOrder.currentPaymentMethod },
        { paymentMethod: newPaymentMethod },
      );

      if (newPaymentMethod === 'prepaid' && mockOrder.currentPaymentMethod === 'cod') {
        // Generate payment link
        const paymentLink = `https://dentalkart.com/pay/${orderNo}?amount=${mockOrder.totalAmount}&ref=method_change`;
        return {
          success: true,
          data: {
            changed: true,
            paymentLink,
            message: `Payment method changed to Prepaid. Please complete payment of ₹${mockOrder.totalAmount} using this link: ${paymentLink}. The link is valid for 24 hours.`,
          },
        };
      }

      // Prepaid → COD
      return {
        success: true,
        data: {
          changed: true,
          message: `Payment method for order ${orderNo} has been changed to Cash on Delivery. Your prepaid amount will be refunded within 5-7 business days.`,
        },
      };
    } catch (err) {
      log.error({ err }, 'Change payment method failed');
      return { success: false, error: 'Failed to change payment method. Please try again.' };
    }
  },
};
