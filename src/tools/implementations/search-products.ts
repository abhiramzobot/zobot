import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * Dentalkart Product Search API (Typesense-backed)
 * GET /search/results/v2?query=...
 *
 * Actual response shape:
 * {
 *   "hits": {
 *     "hits": [
 *       {
 *         "name": "Mani H-Files 31mm",
 *         "sku": "DK-10175",
 *         "price": 350,
 *         "selling_price": 270,
 *         "discount": { "value": 22.86, "label": "23% Off" },
 *         "is_in_stock": true,
 *         "media": { "web_image": "https://..." },
 *         "short_description": "...",
 *         "url_key": "mani-h-files-31mm",
 *         "product_id": 22509,
 *         "stock_alert": "In Stock",
 *         "tier_prices": [],
 *         "rating_count": 5,
 *         "average_rating": 80
 *       }
 *     ]
 *   }
 * }
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'search_products', conversationId: ctx.conversationId });

  const query = String(args.query ?? '').trim();
  if (!query) {
    return {
      success: false,
      error: 'A search query is required to find products.',
    };
  }

  const params = new URLSearchParams({ query });
  const url = `${env.dentalkartSearch.baseUrl}/search/results/v2?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error({ status: response.status, query }, 'Dentalkart search API error');
      return {
        success: false,
        error: `Product search failed with status ${response.status}. Please try a different search term.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Actual structure: data.hits.hits[] — array of product objects
    const hitsWrapper = data?.hits as Record<string, unknown> | undefined;
    const hits = Array.isArray(hitsWrapper?.hits) ? hitsWrapper!.hits : [];

    if (hits.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          query,
          message: `No products found for "${query}". Try a different search term or browse our categories.`,
        },
      };
    }

    // Transform product data — top 10 results
    const products = hits.slice(0, 10).map((product: Record<string, unknown>) => {
      const media = product.media as Record<string, unknown> | undefined;
      const discount = product.discount as Record<string, unknown> | undefined;
      const tierPrices = Array.isArray(product.tier_prices) ? product.tier_prices : [];

      // Build product URL: https://www.dentalkart.com/{url_key}.html?type=p&id={product_id}&mobile_title={name_encoded}
      const urlKey = product.url_key ? String(product.url_key) : '';
      const productId = product.product_id ?? product.id;
      const name = String(product.name ?? '');
      const productUrl = urlKey
        ? `https://www.dentalkart.com/${urlKey}.html?type=p&id=${productId}&mobile_title=${encodeURIComponent(name).replace(/%20/g, '+')}`
        : undefined;

      return {
        productId,
        name,
        sku: product.sku,
        price: product.price,
        sellingPrice: product.selling_price,
        discount: discount
          ? { value: discount.value, label: discount.label }
          : undefined,
        inStock: product.is_in_stock ?? false,
        stockAlert: product.stock_alert ?? (product.is_in_stock ? 'In Stock' : 'Out of Stock'),
        shortDescription: product.short_description
          ? String(product.short_description).replace(/<[^>]*>/g, '').slice(0, 200)
          : undefined,
        imageUrl: media?.web_image
          ? (String(media.web_image).startsWith('//')
            ? 'https:' + String(media.web_image)
            : String(media.web_image))
          : undefined,
        productUrl,
        ratingCount: product.rating_count ?? 0,
        averageRating: product.average_rating ?? 0,
        tierPrices: tierPrices.length > 0
          ? tierPrices.map((tp: Record<string, unknown>) => ({
              qty: tp.qty,
              price: tp.price,
            }))
          : undefined,
      };
    });

    log.info({ query, resultCount: products.length }, 'Product search completed');

    return {
      success: true,
      data: {
        found: true,
        query,
        resultCount: products.length,
        products,
      },
    };
  } catch (err) {
    log.error({ err, query }, 'Failed to search products via Dentalkart search API');
    return {
      success: false,
      error: 'Unable to search products right now. Please try again in a moment.',
    };
  }
};

export const searchProductsTool: ToolDefinition = {
  name: 'search_products',
  version: '1.1.0',
  description:
    'Search the Dentalkart product catalog by keyword. Returns product details including name, price, selling price, discount, stock status, image, and direct product URL. Use when customer asks about dental products, prices, availability, or wants product recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for dental products (e.g., "dental chair", "composite filling", "orthodontic brackets", "h files").',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      query: { type: 'string' },
      resultCount: { type: 'number' },
      products: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.search_products',
  handler,
};
