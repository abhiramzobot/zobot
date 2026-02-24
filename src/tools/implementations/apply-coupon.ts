import { ToolDefinition, ToolHandler } from '../types';
import { getCouponService } from '../../coupon/coupon-service';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

/**
 * Apply Coupon Tool
 *
 * Validates and applies a coupon/discount code to the customer's in-chat cart.
 * Shows savings breakdown and updated cart total.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'apply_coupon', conversationId: ctx.conversationId });

  const couponService = getCouponService();
  if (!couponService) {
    return { success: false, error: 'Coupon service is not available.' };
  }

  const cartService = getCartService();
  if (!cartService) {
    return { success: false, error: 'Cart service is not available.' };
  }

  const code = String(args.coupon_code ?? '').trim();
  if (!code) {
    return { success: false, error: 'Please provide a coupon code.' };
  }

  // Get current cart
  const summary = await cartService.getCartSummary(ctx.visitorId);
  if (summary.itemCount === 0) {
    return { success: false, error: 'Your cart is empty. Add products before applying a coupon.' };
  }

  // Validate the coupon
  const productIds = summary.items.map(i => i.productId);
  const validation = couponService.validate(
    code,
    summary.subtotal,
    summary.totalItems,
    ctx.visitorId,
    productIds,
  );

  if (!validation.valid) {
    log.info({ code, reason: validation.message }, 'Coupon validation failed');
    return {
      success: true,
      data: {
        applied: false,
        code: validation.code,
        message: validation.message,
      },
    };
  }

  // Apply the coupon
  const applied = couponService.apply(code, ctx.visitorId, summary.subtotal);
  if (!applied) {
    return { success: false, error: 'Failed to apply coupon. Please try again.' };
  }

  const newTotal = Math.max(0, summary.subtotal - applied.discountAmount);

  log.info({
    code: applied.code,
    discountAmount: applied.discountAmount,
    originalSubtotal: summary.subtotal,
    newTotal,
  }, 'Coupon applied successfully');

  return {
    success: true,
    data: {
      applied: true,
      code: applied.code,
      discountType: applied.type,
      discountAmount: applied.discountAmount,
      discountLabel: validation.discountLabel,
      description: applied.description,
      originalSubtotal: summary.subtotal,
      newTotal,
      totalSavings: summary.totalSavings + applied.discountAmount,
      message: validation.message,
      cartSummary: {
        itemCount: summary.itemCount,
        totalItems: summary.totalItems,
        subtotal: newTotal,
        couponSavings: applied.discountAmount,
      },
    },
  };
};

export const applyCouponTool: ToolDefinition = {
  name: 'apply_coupon',
  version: '1.0.0',
  description:
    'Apply a coupon or discount code to the customer\'s cart. Validates the code against cart contents, checks eligibility (min order value, expiry, usage limits), and returns updated cart total with savings. Use when customer provides a coupon code or asks about discounts.',
  inputSchema: {
    type: 'object',
    properties: {
      coupon_code: {
        type: 'string',
        description: 'The coupon/discount code to apply (e.g., "DENTAL15", "WELCOME200").',
      },
    },
    required: ['coupon_code'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      applied: { type: 'boolean' },
      code: { type: 'string' },
      discountAmount: { type: 'number' },
      message: { type: 'string' },
      cartSummary: { type: 'object' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 20,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.apply_coupon',
  handler,
};
