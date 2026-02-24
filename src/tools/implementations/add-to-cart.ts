import { ToolDefinition, ToolHandler } from '../types';
import { getCartService } from '../../cart/cart-service';
import { logger } from '../../observability/logger';

/**
 * Add to Cart Tool
 *
 * Adds a product directly to the customer's in-chat shopping cart.
 * Used when customer selects "Add to Cart" from product search results
 * or explicitly asks to add a product to their cart.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'add_to_cart', conversationId: ctx.conversationId });

  const cartService = getCartService();
  if (!cartService) {
    log.error('Cart service not initialized');
    return { success: false, error: 'Cart service is not available right now.' };
  }

  const productId = args.product_id as string | number;
  const name = String(args.name ?? 'Unknown Product');
  const price = Number(args.price ?? 0);
  const sellingPrice = Number(args.selling_price ?? price);
  const quantity = Number(args.quantity ?? 1);
  const imageUrl = args.image_url ? String(args.image_url) : undefined;
  const productUrl = args.product_url ? String(args.product_url) : undefined;
  const sku = args.sku ? String(args.sku) : undefined;
  const inStock = args.in_stock !== false; // Default to true
  const discountValue = args.discount_value ? Number(args.discount_value) : undefined;
  const discountLabel = args.discount_label ? String(args.discount_label) : undefined;

  if (!productId) {
    return { success: false, error: 'Product ID is required to add to cart.' };
  }

  try {
    const result = await cartService.addItem(ctx.visitorId, ctx.conversationId, {
      productId,
      name,
      sku,
      price,
      sellingPrice,
      imageUrl,
      productUrl,
      inStock,
      discount: discountValue ? { value: discountValue, label: discountLabel } : undefined,
      quantity,
    });

    const summary = await cartService.getCartSummary(ctx.visitorId);

    log.info({ productId, name, added: result.added }, 'Add to cart processed');

    return {
      success: true,
      data: {
        added: result.added,
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
    log.error({ err }, 'Failed to add to cart');
    return { success: false, error: 'Unable to add product to cart. Please try again.' };
  }
};

export const addToCartTool: ToolDefinition = {
  name: 'add_to_cart',
  version: '1.0.0',
  description:
    'Add a product to the customer\'s shopping cart directly from chat. Use when the customer wants to add a product they found via search or were browsing. Pass the product details from the search results.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: {
        type: ['string', 'number'],
        description: 'The product ID from search results.',
      },
      name: {
        type: 'string',
        description: 'Product name.',
      },
      price: {
        type: 'number',
        description: 'Original MRP price.',
      },
      selling_price: {
        type: 'number',
        description: 'Selling price (after discount).',
      },
      quantity: {
        type: 'number',
        description: 'Quantity to add (default: 1).',
      },
      sku: {
        type: 'string',
        description: 'Product SKU.',
      },
      image_url: {
        type: 'string',
        description: 'Product image URL.',
      },
      product_url: {
        type: 'string',
        description: 'Product page URL.',
      },
      in_stock: {
        type: 'boolean',
        description: 'Whether the product is in stock.',
      },
      discount_value: {
        type: 'number',
        description: 'Discount percentage value.',
      },
      discount_label: {
        type: 'string',
        description: 'Discount display label (e.g., "23% Off").',
      },
    },
    required: ['product_id', 'name', 'selling_price'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      added: { type: 'boolean' },
      message: { type: 'string' },
      cartSummary: { type: 'object' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.add_to_cart',
  handler,
};
