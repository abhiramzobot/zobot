/**
 * Cancel Order Tool (Phase 2B)
 *
 * Eligibility: Confirmed/Processing only.
 * Double-confirm required. Auto-refund for prepaid.
 */

import { ToolDefinition, ToolResult } from '../types';
import { checkCancellationEligibility, logOrderModification } from './order-modification-utils';
import { logger } from '../../observability/logger';

export const cancelOrderTool: ToolDefinition = {
  name: 'cancel_order',
  version: '1.0.0',
  description: 'Cancel an order. Only works for Confirmed or Processing orders. Requires double confirmation from the customer. Auto-initiates refund for prepaid orders.',
  inputSchema: {
    type: 'object',
    properties: {
      orderNo: { type: 'string', description: 'Order number to cancel' },
      reason: { type: 'string', description: 'Cancellation reason provided by customer' },
      confirmed: { type: 'boolean', description: 'Whether customer has confirmed cancellation (must be true)' },
    },
    required: ['orderNo', 'reason', 'confirmed'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      cancellationId: { type: 'string' },
      refundInitiated: { type: 'boolean' },
      refundAmount: { type: 'number' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tools.cancel_order',
  cacheable: false,
  retryable: true,
  retryDelayMs: 2000,

  handler: async (args): Promise<ToolResult> => {
    const { orderNo, reason, confirmed } = args as { orderNo: string; reason: string; confirmed: boolean };
    const log = logger.child({ tool: 'cancel_order', orderNo });

    if (!confirmed) {
      return {
        success: true,
        data: {
          requiresConfirmation: true,
          message: `Are you sure you want to cancel order ${orderNo}? This action cannot be undone. Please confirm.`,
        },
      };
    }

    try {
      // Simulate order lookup and cancellation via OMS API
      // In production: call VineRetail cancel API
      const mockOrder = {
        orderNo,
        status: 'Confirmed',
        paymentMethod: 'prepaid',
        totalAmount: 1299,
      };

      const eligibility = checkCancellationEligibility(mockOrder.status);
      if (!eligibility.eligible) {
        return { success: true, data: { cancelled: false, message: eligibility.reason } };
      }

      // Log before/after state
      logOrderModification('cancel', orderNo,
        { status: mockOrder.status },
        { status: 'Cancelled', reason },
      );

      const refundInitiated = mockOrder.paymentMethod === 'prepaid';

      return {
        success: true,
        data: {
          cancelled: true,
          cancellationId: `CAN-${Date.now()}`,
          refundInitiated,
          refundAmount: refundInitiated ? mockOrder.totalAmount : 0,
          message: refundInitiated
            ? `Order ${orderNo} has been cancelled. A refund of ₹${mockOrder.totalAmount} will be initiated to your original payment method within 5-7 business days.`
            : `Order ${orderNo} has been cancelled successfully.`,
        },
      };
    } catch (err) {
      log.error({ err }, 'Cancel order failed');
      return { success: false, error: 'Failed to cancel order. Please try again.' };
    }
  },
};
