import { ToolDefinition, ToolHandler } from '../types';
import { knowledgeService } from '../../knowledge/knowledge-service';

const handler: ToolHandler = async (args) => {
  const query = String(args.query ?? '');
  const products = knowledgeService.searchProducts(query);

  if (products.length === 0) {
    return {
      success: true,
      data: {
        found: false,
        message: 'No products matched the query. Try a different search term.',
      },
    };
  }

  return {
    success: true,
    data: {
      found: true,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        features: p.features,
        pricing: p.pricing,
        category: p.category,
      })),
    },
  };
};

export const getProductInfoTool: ToolDefinition = {
  name: 'get_product_info',
  version: '1.0.0',
  description: 'Search and retrieve product information from the knowledge base.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query for products' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      products: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 30,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.get_product_info',
  handler,
};
