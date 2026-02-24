/**
 * AI Product Recommendations Tool (Enhancement v5 — A4)
 *
 * Returns context-aware product suggestions based on
 * cart contents, purchase history, and current query.
 */

import { ToolDefinition, ToolHandler } from '../types';
import { getRecommendationEngine } from '../../recommendations/recommendation-engine';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'recommend_products', conversationId: ctx.conversationId });

  const engine = getRecommendationEngine();
  if (!engine) {
    return { success: false, error: 'Recommendation engine is not available.' };
  }

  const query = args.query ? String(args.query).trim() : '';
  const maxResults = args.max_results ? Number(args.max_results) : 4;

  // Build context from cart
  const cartService = getCartService();
  let cartProductIds: (string | number)[] = [];
  let cartProductNames: string[] = [];

  if (cartService) {
    const summary = await cartService.getCartSummary(ctx.visitorId);
    cartProductIds = summary.items.map((i) => i.productId);
    cartProductNames = summary.items.map((i) => i.name);
  }

  const result = engine.recommend(
    {
      cartProductIds,
      cartProductNames,
      currentQuery: query,
      visitorId: ctx.visitorId,
    },
    maxResults,
  );

  log.info({
    query,
    cartItems: cartProductNames.length,
    recommendations: result.recommendations.length,
    strategy: result.strategy,
  }, 'Product recommendations generated');

  return {
    success: true,
    data: {
      recommendations: result.recommendations.map((r) => ({
        type: r.type,
        reason: r.reason,
        confidence: r.confidence,
        product: {
          productId: r.product.productId,
          name: r.product.name,
          price: r.product.price,
          sellingPrice: r.product.sellingPrice,
          imageUrl: r.product.imageUrl,
          productUrl: r.product.productUrl,
          category: r.product.category,
          inStock: r.product.inStock,
          savings: r.product.price > r.product.sellingPrice
            ? `₹${(r.product.price - r.product.sellingPrice).toFixed(0)} off`
            : undefined,
        },
      })),
      count: result.recommendations.length,
      strategy: result.strategy,
      context: result.context,
      message:
        result.recommendations.length > 0
          ? `Here are ${result.recommendations.length} product recommendations for you!`
          : 'No specific recommendations available at the moment.',
    },
  };
};

export const recommendProductsTool: ToolDefinition = {
  name: 'recommend_products',
  version: '1.0.0',
  description:
    'Get AI-powered product recommendations based on cart contents, browsing context, or a search query. Returns personalized suggestions with cross-sell, upsell, and complementary products. Use when customer asks "what else do I need?", "any suggestions?", or after adding items to cart.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or product context for recommendations (optional if cart has items).',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of recommendations to return (default: 4, max: 8).',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      recommendations: { type: 'array' },
      count: { type: 'number' },
      strategy: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.recommend_products',
  handler,
};
