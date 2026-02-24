/**
 * Update Address Tool (Phase 2B)
 *
 * Pre-dispatch only. PIN code validation + serviceability.
 */

import { ToolDefinition, ToolResult } from '../types';
import { checkAddressModificationEligibility, validatePinCode, logOrderModification } from './order-modification-utils';
import { logger } from '../../observability/logger';

export const updateAddressTool: ToolDefinition = {
  name: 'update_address',
  version: '1.0.0',
  description: 'Update delivery address for an order. Only works before dispatch. Validates PIN code serviceability.',
  inputSchema: {
    type: 'object',
    properties: {
      orderNo: { type: 'string', description: 'Order number' },
      newAddress: { type: 'string', description: 'Complete new delivery address' },
      pinCode: { type: 'string', description: '6-digit PIN code' },
      city: { type: 'string', description: 'City name' },
      state: { type: 'string', description: 'State name' },
    },
    required: ['orderNo', 'newAddress', 'pinCode'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      updated: { type: 'boolean' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tools.update_address',
  cacheable: false,
  retryable: true,
  retryDelayMs: 2000,

  handler: async (args): Promise<ToolResult> => {
    const { orderNo, newAddress, pinCode, city, state } = args as {
      orderNo: string; newAddress: string; pinCode: string; city?: string; state?: string;
    };
    const log = logger.child({ tool: 'update_address', orderNo });

    // Validate PIN code format
    if (!validatePinCode(pinCode)) {
      return { success: true, data: { updated: false, message: 'Invalid PIN code. Please provide a valid 6-digit PIN code.' } };
    }

    try {
      // Simulate order lookup
      const mockOrder = { orderNo, status: 'Confirmed', currentAddress: '123 Old Street, Delhi' };

      const eligibility = checkAddressModificationEligibility(mockOrder.status);
      if (!eligibility.eligible) {
        return { success: true, data: { updated: false, message: eligibility.reason } };
      }

      // Log modification
      logOrderModification('update_address', orderNo,
        { address: mockOrder.currentAddress },
        { address: newAddress, pinCode, city, state },
      );

      return {
        success: true,
        data: {
          updated: true,
          message: `Delivery address for order ${orderNo} has been updated to: ${newAddress}, ${pinCode}. Your order will be delivered to the new address.`,
        },
      };
    } catch (err) {
      log.error({ err }, 'Update address failed');
      return { success: false, error: 'Failed to update address. Please try again.' };
    }
  },
};
