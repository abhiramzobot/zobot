import { ToolDefinition, ToolHandler } from '../types';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

/**
 * View Cart Tool
 *
 * Shows the customer's current cart contents with item details,
 * quantities, prices, and total savings.
 */
const handler: ToolHandler = async (_args, ctx) => {
  const log = logger.child({ tool: 'view_cart', conversationId: ctx.conversationId });

  const cartService = getCartService();
  if (!cartService) {
    log.error('Cart service not initialized');
    return { success: false, error: 'Cart service is not available right now.' };
  }

  try {
    const cart = await cartService.getCart(ctx.visitorId);
    const summary = await cartService.getCartSummary(ctx.visitorId);

    if (!cart || cart.items.length === 0) {
      return {
        success: true,
        data: {
          empty: true,
          message: 'Your cart is empty. Search for products and add them to your cart!',
          cartSummary: { itemCount: 0, totalItems: 0, subtotal: 0, totalSavings: 0, items: [] },
        },
      };
    }

    // Build detailed cart view
    const items = cart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      sellingPrice: item.sellingPrice,
      lineTotal: item.sellingPrice * item.quantity,
      imageUrl: item.imageUrl,
      productUrl: item.productUrl,
      discount: item.discount,
      inStock: item.inStock,
    }));

    log.info({ visitorId: ctx.visitorId, itemCount: items.length }, 'Cart viewed');

    return {
      success: true,
      data: {
        empty: false,
        items,
        cartSummary: summary,
        checkoutUrl: `https://www.dentalkart.com/checkout`,
      },
    };
  } catch (err) {
    log.error({ err }, 'Failed to view cart');
    return { success: false, error: 'Unable to load your cart. Please try again.' };
  }
};

export const viewCartTool: ToolDefinition = {
  name: 'view_cart',
  version: '1.0.0',
  description:
    'View the customer\'s current shopping cart. Shows all items, quantities, prices, subtotal, and total savings. Use when customer asks to see their cart, check what\'s in it, or before checkout.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      empty: { type: 'boolean' },
      items: { type: 'array' },
      cartSummary: { type: 'object' },
      checkoutUrl: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.view_cart',
  handler,
};
