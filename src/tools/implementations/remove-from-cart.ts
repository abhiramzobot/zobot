import { ToolDefinition, ToolHandler } from '../types';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

/**
 * Remove from Cart / Update Cart Tool
 *
 * Removes a product from the cart or updates its quantity.
 * Can also clear the entire cart.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'remove_from_cart', conversationId: ctx.conversationId });

  const cartService = getCartService();
  if (!cartService) {
    log.error('Cart service not initialized');
    return { success: false, error: 'Cart service is not available right now.' };
  }

  const action = String(args.action ?? 'remove');
  const productId = args.product_id as string | number | undefined;
  const quantity = args.quantity !== undefined ? Number(args.quantity) : undefined;

  try {
    // Clear entire cart
    if (action === 'clear') {
      const result = await cartService.clearCart(ctx.visitorId);
      log.info({ visitorId: ctx.visitorId }, 'Cart cleared');
      return {
        success: true,
        data: {
          action: 'cleared',
          message: result.message,
          cartSummary: { itemCount: 0, totalItems: 0, subtotal: 0, totalSavings: 0 },
        },
      };
    }

    if (!productId) {
      return { success: false, error: 'Product ID is required to modify cart.' };
    }

    // Update quantity
    if (action === 'update' && quantity !== undefined) {
      const result = await cartService.updateQuantity(ctx.visitorId, productId, quantity);
      const summary = await cartService.getCartSummary(ctx.visitorId);
      log.info({ productId, quantity, updated: result.updated }, 'Cart quantity updated');
      return {
        success: true,
        data: {
          action: 'updated',
          message: result.message,
          cartSummary: {
            itemCount: summary.itemCount,
            totalItems: summary.totalItems,
            subtotal: summary.subtotal,
            totalSavings: summary.totalSavings,
          },
        },
      };
    }

    // Remove item
    const result = await cartService.removeItem(ctx.visitorId, productId);
    const summary = await cartService.getCartSummary(ctx.visitorId);
    log.info({ productId, removed: result.removed }, 'Item removed from cart');
    return {
      success: true,
      data: {
        action: 'removed',
        message: result.message,
        cartSummary: {
          itemCount: summary.itemCount,
          totalItems: summary.totalItems,
          subtotal: summary.subtotal,
          totalSavings: summary.totalSavings,
        },
      },
    };
  } catch (err) {
    log.error({ err }, 'Failed to modify cart');
    return { success: false, error: 'Unable to update your cart. Please try again.' };
  }
};

export const removeFromCartTool: ToolDefinition = {
  name: 'remove_from_cart',
  version: '1.0.0',
  description:
    'Remove a product from the cart, update its quantity, or clear the entire cart. Actions: "remove" (remove one product), "update" (change quantity), "clear" (empty entire cart).',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action: "remove" to remove a product, "update" to change quantity, "clear" to empty cart.',
      },
      product_id: {
        type: ['string', 'number'],
        description: 'Product ID to remove or update. Not needed for "clear".',
      },
      quantity: {
        type: 'number',
        description: 'New quantity (for "update" action). Set to 0 to remove.',
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string' },
      message: { type: 'string' },
      cartSummary: { type: 'object' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.remove_from_cart',
  handler,
};
