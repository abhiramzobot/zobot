/**
 * Bulk Pricing Tool (Enhancement v5 — C2)
 *
 * Fetches tier-based pricing for a product and calculates
 * savings for the requested quantity.
 */

import { ToolDefinition, ToolHandler } from '../types';
import { logger } from '../../observability/logger';

// ───── Tier Pricing Rules ──────────────────────────────────

interface PriceTier {
  minQty: number;
  maxQty: number | null;
  pricePerUnit: number;
  discountPercent: number;
  label: string;
}

/** Demo tier pricing for dental products */
const TIER_PRICING: Record<string, PriceTier[]> = {
  default: [
    { minQty: 1, maxQty: 4, pricePerUnit: 0, discountPercent: 0, label: 'Retail' },
    { minQty: 5, maxQty: 9, pricePerUnit: 0, discountPercent: 10, label: 'Small Bulk' },
    { minQty: 10, maxQty: 24, pricePerUnit: 0, discountPercent: 15, label: 'Medium Bulk' },
    { minQty: 25, maxQty: 49, pricePerUnit: 0, discountPercent: 20, label: 'Large Bulk' },
    { minQty: 50, maxQty: null, pricePerUnit: 0, discountPercent: 25, label: 'Wholesale' },
  ],
};

function getTierPricing(basePrice: number): PriceTier[] {
  return TIER_PRICING.default.map((tier) => ({
    ...tier,
    pricePerUnit: Math.round(basePrice * (1 - tier.discountPercent / 100) * 100) / 100,
  }));
}

function findTier(tiers: PriceTier[], quantity: number): PriceTier {
  for (const tier of [...tiers].reverse()) {
    if (quantity >= tier.minQty) return tier;
  }
  return tiers[0];
}

// ───── Handler ─────────────────────────────────────────────

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'get_bulk_pricing', conversationId: ctx.conversationId });

  const productName = args.product_name ? String(args.product_name).trim() : '';
  const productId = args.product_id ? String(args.product_id).trim() : '';
  const quantity = args.quantity ? Number(args.quantity) : 0;
  const basePrice = args.base_price ? Number(args.base_price) : 999; // fallback demo price

  if (!productName && !productId) {
    return { success: false, error: 'Please specify a product name or ID for bulk pricing.' };
  }

  const tiers = getTierPricing(basePrice);
  const requestedTier = quantity > 0 ? findTier(tiers, quantity) : null;

  // Build tier table
  const tierTable = tiers.map((tier) => ({
    label: tier.label,
    minQty: tier.minQty,
    maxQty: tier.maxQty || '50+',
    pricePerUnit: `₹${tier.pricePerUnit.toFixed(2)}`,
    discountPercent: `${tier.discountPercent}%`,
    savings: tier.discountPercent > 0
      ? `Save ₹${(basePrice * tier.discountPercent / 100).toFixed(2)}/unit`
      : 'Retail price',
  }));

  let message = `Bulk pricing tiers for "${productName || productId}" (base price: ₹${basePrice}):`;
  let totalCost: number | undefined;
  let totalSavings: number | undefined;

  if (requestedTier && quantity > 0) {
    totalCost = Math.round(requestedTier.pricePerUnit * quantity * 100) / 100;
    totalSavings = Math.round((basePrice - requestedTier.pricePerUnit) * quantity * 100) / 100;
    message = `For ${quantity} units of "${productName || productId}": ₹${requestedTier.pricePerUnit}/unit (${requestedTier.label} tier, ${requestedTier.discountPercent}% off). Total: ₹${totalCost.toFixed(2)}, you save ₹${totalSavings.toFixed(2)}!`;
  }

  log.info({ productName, quantity, tier: requestedTier?.label }, 'Bulk pricing queried');

  return {
    success: true,
    data: {
      productName: productName || productId,
      basePrice,
      tiers: tierTable,
      requestedQuantity: quantity || undefined,
      appliedTier: requestedTier
        ? {
            label: requestedTier.label,
            pricePerUnit: requestedTier.pricePerUnit,
            discountPercent: requestedTier.discountPercent,
          }
        : undefined,
      totalCost,
      totalSavings,
      message,
      moqNote: 'Minimum Order Quantity (MOQ) for wholesale pricing: 50 units. Contact sales for custom quotes above 100 units.',
    },
  };
};

export const getBulkPricingTool: ToolDefinition = {
  name: 'get_bulk_pricing',
  version: '1.0.0',
  description:
    'Get bulk/wholesale pricing tiers for a product. Shows quantity-based discounts, MOQ (minimum order quantity), and total savings. Use when customer asks "what is the bulk price?", "do you offer wholesale discounts?", or mentions ordering large quantities.',
  inputSchema: {
    type: 'object',
    properties: {
      product_name: {
        type: 'string',
        description: 'Product name to get bulk pricing for.',
      },
      product_id: {
        type: 'string',
        description: 'Product ID (alternative to product_name).',
      },
      quantity: {
        type: 'number',
        description: 'Desired quantity (optional — shows all tiers if not specified).',
      },
      base_price: {
        type: 'number',
        description: 'Base retail price per unit (for calculation).',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      tiers: { type: 'array' },
      totalCost: { type: 'number' },
      totalSavings: { type: 'number' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 20,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.get_bulk_pricing',
  handler,
};
