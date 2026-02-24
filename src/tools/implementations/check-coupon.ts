import { ToolDefinition, ToolHandler } from '../types';
import { getCouponService } from '../../coupon/coupon-service';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

/**
 * Check Coupon Tool
 *
 * Validates a coupon code without applying it — shows eligibility and estimated savings.
 * Also lists available coupons if no code is provided.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'check_coupon', conversationId: ctx.conversationId });

  const couponService = getCouponService();
  if (!couponService) {
    return { success: false, error: 'Coupon service is not available.' };
  }

  const code = args.coupon_code ? String(args.coupon_code).trim() : '';

  // If no code provided, list available coupons
  if (!code) {
    const activeCoupons = couponService.getActiveCoupons();
    const couponList = activeCoupons.map(c => ({
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value,
      minOrderValue: c.minOrderValue || 0,
    }));

    return {
      success: true,
      data: {
        availableCoupons: couponList,
        count: couponList.length,
        message: couponList.length > 0
          ? `We have ${couponList.length} active coupon(s) available!`
          : 'No active coupons available at the moment.',
      },
    };
  }

  // Validate specific code
  const cartService = getCartService();
  let subtotal = 0;
  let itemCount = 0;
  let productIds: (string | number)[] = [];

  if (cartService) {
    const summary = await cartService.getCartSummary(ctx.visitorId);
    subtotal = summary.subtotal;
    itemCount = summary.totalItems;
    productIds = summary.items.map(i => i.productId);
  }

  const result = couponService.validate(code, subtotal, itemCount, ctx.visitorId, productIds);

  log.info({ code, valid: result.valid }, 'Coupon eligibility checked');

  return {
    success: true,
    data: {
      valid: result.valid,
      code: result.code,
      message: result.message,
      discountAmount: result.discountAmount,
      discountLabel: result.discountLabel,
      estimatedSavings: result.valid ? `₹${(result.discountAmount || 0).toFixed(2)}` : undefined,
    },
  };
};

export const checkCouponTool: ToolDefinition = {
  name: 'check_coupon',
  version: '1.0.0',
  description:
    'Check if a coupon code is valid and see estimated savings without applying it. If no code is provided, lists all available coupons. Use when customer asks "do you have any coupons?", "what discounts are available?", or wants to verify a code before applying.',
  inputSchema: {
    type: 'object',
    properties: {
      coupon_code: {
        type: 'string',
        description: 'The coupon code to validate (optional — if empty, lists all available coupons).',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      valid: { type: 'boolean' },
      code: { type: 'string' },
      message: { type: 'string' },
      discountAmount: { type: 'number' },
      availableCoupons: { type: 'array' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.check_coupon',
  handler,
};
