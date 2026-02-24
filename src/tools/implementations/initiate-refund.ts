/**
 * Initiate Refund Tool (Enhancement v5 — A3)
 *
 * Initiates a refund/return for an order.
 * Uses double-confirm pattern (same as cancel-order).
 * Steps: check eligibility → show confirmation → process refund.
 */

import { ToolDefinition, ToolResult } from '../types';
import { checkRefundEligibility, logOrderModification } from './order-modification-utils';
import { logger } from '../../observability/logger';

export const initiateRefundTool: ToolDefinition = {
  name: 'initiate_refund',
  version: '1.0.0',
  description:
    'Initiate a refund or return for a delivered/shipped order. Checks refund eligibility (return window, order status), shows estimated refund amount and timeline, and processes the refund after customer confirmation. Use when customer says "I want a refund", "return this order", or "money back".',
  inputSchema: {
    type: 'object',
    properties: {
      orderNo: {
        type: 'string',
        description: 'Order number to refund',
      },
      reason: {
        type: 'string',
        description: 'Reason for the refund/return (e.g., "damaged product", "wrong item", "not satisfied")',
      },
      refundType: {
        type: 'string',
        enum: ['full_refund', 'partial_refund', 'exchange'],
        description: 'Type of refund requested. Defaults to full_refund.',
      },
      itemIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific item IDs to return (for partial refund). If empty, applies to entire order.',
      },
      confirmed: {
        type: 'boolean',
        description: 'Whether customer has confirmed the refund (must be true to process)',
      },
    },
    required: ['orderNo', 'reason'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      refundId: { type: 'string' },
      refundAmount: { type: 'number' },
      refundMode: { type: 'string' },
      estimatedDays: { type: 'number' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tools.initiate_refund',
  cacheable: false,
  retryable: true,
  retryDelayMs: 2000,

  handler: async (args): Promise<ToolResult> => {
    const {
      orderNo,
      reason,
      refundType = 'full_refund',
      itemIds,
      confirmed,
    } = args as {
      orderNo: string;
      reason: string;
      refundType?: string;
      itemIds?: string[];
      confirmed?: boolean;
    };
    const log = logger.child({ tool: 'initiate_refund', orderNo });

    try {
      // Simulate order lookup (in production: call VineRetail API)
      const mockOrder = {
        orderNo,
        status: 'Delivered',
        paymentMethod: 'prepaid',
        totalAmount: 2499,
        deliveredAt: Date.now() - 3 * 86400000, // 3 days ago
        items: [
          { id: 'item_1', name: 'Dental Composite Kit', price: 1499, quantity: 1 },
          { id: 'item_2', name: 'Bonding Agent', price: 1000, quantity: 1 },
        ],
      };

      // Check eligibility
      const eligibility = checkRefundEligibility(mockOrder.status, mockOrder.deliveredAt);
      if (!eligibility.eligible) {
        return {
          success: true,
          data: {
            refundInitiated: false,
            message: eligibility.reason,
            orderStatus: eligibility.currentStatus,
          },
        };
      }

      // Calculate refund amount
      let refundAmount = mockOrder.totalAmount;
      let refundItems = mockOrder.items;

      if (refundType === 'partial_refund' && itemIds && itemIds.length > 0) {
        refundItems = mockOrder.items.filter((i) => itemIds.includes(i.id));
        refundAmount = refundItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      }

      // Double-confirm pattern: first call shows details, second processes
      if (!confirmed) {
        const refundModeLabel =
          mockOrder.paymentMethod === 'prepaid'
            ? 'Original payment method'
            : 'Bank account (NEFT)';

        return {
          success: true,
          data: {
            requiresConfirmation: true,
            refundPreview: {
              orderNo,
              refundType,
              refundAmount,
              refundMode: refundModeLabel,
              estimatedDays: mockOrder.paymentMethod === 'prepaid' ? 5 : 7,
              items: refundItems.map((i) => ({
                name: i.name,
                price: i.price,
                quantity: i.quantity,
              })),
              reason,
            },
            message: `Refund of ₹${refundAmount.toFixed(2)} will be processed to your ${refundModeLabel.toLowerCase()} within ${mockOrder.paymentMethod === 'prepaid' ? '5-7' : '7-10'} business days. Please confirm to proceed.`,
          },
        };
      }

      // Process refund
      const refundId = `REF-${Date.now()}`;

      logOrderModification('refund', orderNo, { status: mockOrder.status }, {
        status: 'Refund Initiated',
        refundId,
        refundAmount,
        reason,
      });

      log.info({ refundId, refundAmount, reason }, 'Refund initiated');

      return {
        success: true,
        data: {
          refundInitiated: true,
          refundId,
          refundAmount,
          refundMode: mockOrder.paymentMethod === 'prepaid' ? 'original_payment' : 'bank_transfer',
          refundModeLabel:
            mockOrder.paymentMethod === 'prepaid'
              ? 'Original payment method'
              : 'Bank account (NEFT)',
          estimatedDays: mockOrder.paymentMethod === 'prepaid' ? 5 : 7,
          items: refundItems.map((i) => ({ name: i.name, price: i.price })),
          message: `Refund of ₹${refundAmount.toFixed(2)} has been initiated (ID: ${refundId}). The amount will be credited within 5-7 business days.`,
        },
      };
    } catch (err) {
      log.error({ err }, 'Initiate refund failed');
      return { success: false, error: 'Failed to initiate refund. Please try again.' };
    }
  },
};
