/**
 * Order Modification Utilities (Phase 2B)
 *
 * Shared eligibility checker, state logger.
 */

import { logger } from '../../observability/logger';

export type OrderStatus = 'Confirmed' | 'Processing' | 'Dispatched' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Returned';

export interface OrderEligibility {
  eligible: boolean;
  reason: string;
  currentStatus: OrderStatus;
}

/** Statuses that allow cancellation */
const CANCELLABLE_STATUSES: OrderStatus[] = ['Confirmed', 'Processing'];

/** Statuses that allow address modification */
const ADDRESS_MODIFIABLE_STATUSES: OrderStatus[] = ['Confirmed', 'Processing'];

/** Statuses that allow payment method change */
const PAYMENT_MODIFIABLE_STATUSES: OrderStatus[] = ['Confirmed'];

/** Statuses that allow refund/return */
const REFUNDABLE_STATUSES: OrderStatus[] = ['Delivered', 'Shipped'];

/** Return window in days */
const RETURN_WINDOW_DAYS = 15;

export function checkCancellationEligibility(orderStatus: string): OrderEligibility {
  const status = orderStatus as OrderStatus;
  if (CANCELLABLE_STATUSES.includes(status)) {
    return { eligible: true, reason: 'Order can be cancelled', currentStatus: status };
  }
  return {
    eligible: false,
    reason: `Order cannot be cancelled in "${status}" status. Cancellation is only available for Confirmed or Processing orders.`,
    currentStatus: status,
  };
}

export function checkAddressModificationEligibility(orderStatus: string): OrderEligibility {
  const status = orderStatus as OrderStatus;
  if (ADDRESS_MODIFIABLE_STATUSES.includes(status)) {
    return { eligible: true, reason: 'Address can be modified', currentStatus: status };
  }
  return {
    eligible: false,
    reason: `Address cannot be modified in "${status}" status. Address changes are only available before dispatch.`,
    currentStatus: status,
  };
}

export function checkPaymentModificationEligibility(orderStatus: string): OrderEligibility {
  const status = orderStatus as OrderStatus;
  if (PAYMENT_MODIFIABLE_STATUSES.includes(status)) {
    return { eligible: true, reason: 'Payment method can be changed', currentStatus: status };
  }
  return {
    eligible: false,
    reason: `Payment method cannot be changed in "${status}" status. Changes are only available for Confirmed orders.`,
    currentStatus: status,
  };
}

export function checkRefundEligibility(orderStatus: string, deliveredAt?: number): OrderEligibility {
  const status = orderStatus as OrderStatus;
  if (!REFUNDABLE_STATUSES.includes(status)) {
    return {
      eligible: false,
      reason: `Refund/return is not available for orders in "${status}" status. Refunds are available for Delivered or Shipped orders within ${RETURN_WINDOW_DAYS} days.`,
      currentStatus: status,
    };
  }

  // Check return window
  if (deliveredAt) {
    const daysSinceDelivery = (Date.now() - deliveredAt) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
      return {
        eligible: false,
        reason: `The ${RETURN_WINDOW_DAYS}-day return window has expired. This order was delivered ${Math.round(daysSinceDelivery)} days ago.`,
        currentStatus: status,
      };
    }
  }

  return { eligible: true, reason: 'Order is eligible for refund/return', currentStatus: status };
}

export function validatePinCode(pinCode: string): boolean {
  return /^\d{6}$/.test(pinCode);
}

export function logOrderModification(
  operation: string,
  orderNo: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  logger.info({
    operation,
    orderNo,
    before,
    after,
    timestamp: Date.now(),
  }, 'Order modification logged');
}
