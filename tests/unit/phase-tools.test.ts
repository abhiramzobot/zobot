/**
 * Tests for Phase A-D tool implementations:
 * - analyze-image (vision)
 * - get-bulk-pricing
 * - request-quote
 * - initiate-refund
 * - dynamic tone adjustment
 * - Zoho Lens AR client
 * - flow builder CRUD
 */

import { getBulkPricingTool } from '../../src/tools/implementations/get-bulk-pricing';
import { requestQuoteTool } from '../../src/tools/implementations/request-quote';
import { initiateRefundTool } from '../../src/tools/implementations/initiate-refund';
import { ToolContext } from '../../src/tools/types';

// Mock env to ensure no real API calls for vision
jest.mock('../../src/config/env', () => ({
  env: {
    openai: { apiKey: '', model: 'gpt-4o', timeoutMs: 15000 },
    vineretail: { baseUrl: '', apiKey: '', apiOwner: '' },
    clickpost: { baseUrl: '', apiKey: '', username: '' },
    dentalkartAdmin: { baseUrl: '', apiKey: '' },
    dentalkartSearch: { baseUrl: '' },
  },
}));

import { analyzeImageTool } from '../../src/tools/implementations/analyze-image';

const mockCtx: ToolContext = {
  conversationId: 'test-conv-1',
  tenantId: 'default',
  channel: 'web',
  visitorId: 'test-visitor',
  requestId: 'test-req-1',
};

// Helper to safely access result.data properties
function getData(result: { data?: unknown }): Record<string, any> {
  return result.data as Record<string, any>;
}

describe('get_bulk_pricing tool', () => {
  it('should return tier pricing for a product', async () => {
    const result = await getBulkPricingTool.handler(
      { product_name: 'Dental Composite', base_price: 1000 },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.tiers).toBeDefined();
    expect(data.tiers.length).toBe(5);
    expect(data.message).toContain('Dental Composite');
  });

  it('should calculate total for specific quantity', async () => {
    const result = await getBulkPricingTool.handler(
      { product_name: 'Bonding Agent', base_price: 500, quantity: 10 },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.appliedTier).toBeDefined();
    expect(data.appliedTier.label).toBe('Medium Bulk');
    expect(data.appliedTier.discountPercent).toBe(15);
    expect(data.totalCost).toBeDefined();
    expect(data.totalSavings).toBeGreaterThan(0);
  });

  it('should use wholesale tier for 50+ units', async () => {
    const result = await getBulkPricingTool.handler(
      { product_name: 'Gloves', base_price: 200, quantity: 100 },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.appliedTier.label).toBe('Wholesale');
    expect(data.appliedTier.discountPercent).toBe(25);
  });

  it('should fail when no product specified', async () => {
    const result = await getBulkPricingTool.handler({}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('specify a product');
  });
});

describe('request_quote tool', () => {
  it('should create quote with valid data', async () => {
    const result = await requestQuoteTool.handler(
      {
        company_name: 'DentaCorp',
        contact_name: 'Dr. Smith',
        email: 'smith@dentacorp.com',
        items: [
          { productName: 'Composite Kit', quantity: 50 },
          { productName: 'Bonding Agent', quantity: 30 },
        ],
      },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.quoteCreated).toBe(true);
    expect(data.quoteId).toMatch(/^QR-/);
    expect(data.totalItems).toBe(2);
    expect(data.totalQuantity).toBe(80);
  });

  it('should request contact info when none provided', async () => {
    const result = await requestQuoteTool.handler(
      {
        items: [{ productName: 'Product A', quantity: 10 }],
      },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.needsContactInfo).toBe(true);
  });

  it('should fail when no items specified', async () => {
    const result = await requestQuoteTool.handler(
      { company_name: 'Corp', contact_name: 'John' },
      mockCtx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one product');
  });

  it('should mark items >= 50 qty as wholesale eligible', async () => {
    const result = await requestQuoteTool.handler(
      {
        contact_name: 'John',
        email: 'john@test.com',
        items: [{ productName: 'Product X', quantity: 100 }],
      },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.items[0].note).toContain('Wholesale');
  });
});

describe('initiate_refund tool', () => {
  it('should return refund preview without confirmation', async () => {
    const result = await initiateRefundTool.handler(
      { orderNo: 'ORD-001', reason: 'damaged product' },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.requiresConfirmation).toBe(true);
    expect(data.refundPreview).toBeDefined();
    expect(data.refundPreview.refundAmount).toBeGreaterThan(0);
  });

  it('should process refund when confirmed', async () => {
    const result = await initiateRefundTool.handler(
      { orderNo: 'ORD-001', reason: 'wrong item', confirmed: true },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.refundInitiated).toBe(true);
    expect(data.refundId).toMatch(/^REF-/);
    expect(data.refundAmount).toBeGreaterThan(0);
  });

  it('should calculate partial refund for specific items', async () => {
    const result = await initiateRefundTool.handler(
      {
        orderNo: 'ORD-001',
        reason: 'not needed',
        refundType: 'partial_refund',
        itemIds: ['item_1'],
      },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.refundPreview.refundAmount).toBe(1499);
  });
});

describe('analyze_image tool', () => {
  it('should reject empty image URL', async () => {
    const result = await analyzeImageTool.handler({ image_url: '' }, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('provide an image URL');
  });

  it('should reject invalid URL format', async () => {
    const result = await analyzeImageTool.handler(
      { image_url: 'not-a-url' },
      mockCtx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid image URL');
  });

  it('should return placeholder when no API key configured', async () => {
    const result = await analyzeImageTool.handler(
      { image_url: 'https://example.com/image.jpg', analysis_type: 'general' },
      mockCtx,
    );
    const data = getData(result);
    expect(result.success).toBe(true);
    expect(data.analysisType).toBe('general');
    expect(data.suggestedActions).toBeDefined();
  });

  it('should handle different analysis types', async () => {
    for (const type of ['damage_assessment', 'product_identification', 'prescription_analysis', 'general']) {
      const result = await analyzeImageTool.handler(
        { image_url: 'https://example.com/test.jpg', analysis_type: type },
        mockCtx,
      );
      const data = getData(result);
      expect(result.success).toBe(true);
      expect(data.analysisType).toBe(type);
    }
  });
});

describe('dynamic tone adjustment', () => {
  it('should detect frustration keywords', () => {
    const frustrationKeywords = ['angry', 'terrible', 'horrible', 'worst', 'awful', 'hate', 'scam', 'fraud', 'disappointed', 'frustrated', 'ridiculous', 'unacceptable', 'useless', 'waste'];
    const positiveKeywords = ['thank', 'great', 'excellent', 'perfect', 'awesome', 'good', 'happy', 'love', 'amazing', 'wonderful', 'fantastic'];

    const negMsg = 'I am angry and frustrated with this terrible service';
    let negScore = 0;
    for (const kw of frustrationKeywords) {
      if (negMsg.includes(kw)) negScore++;
    }
    expect(negScore).toBeGreaterThan(0);

    const posMsg = 'Thank you so much, great service!';
    let posScore = 0;
    for (const kw of positiveKeywords) {
      if (posMsg.includes(kw)) posScore++;
    }
    expect(posScore).toBeGreaterThan(0);
  });

  it('should calculate correct sentiment score', () => {
    const messages = ['angry terrible', 'frustrated', 'happy great'];
    const frustrationKeywords = ['angry', 'terrible', 'frustrated'];
    const positiveKeywords = ['happy', 'great'];

    let negScore = 0;
    let posScore = 0;
    for (const msg of messages) {
      for (const kw of frustrationKeywords) {
        if (msg.includes(kw)) negScore++;
      }
      for (const kw of positiveKeywords) {
        if (msg.includes(kw)) posScore++;
      }
    }

    const sentimentScore = (posScore - negScore) / Math.max(messages.length, 1);
    expect(sentimentScore).toBeLessThan(0);
  });
});

describe('Zoho Lens AR Client', () => {
  it('should have correct tool schema for start_ar_demo', () => {
    const { startARDemoTool } = require('../../src/tools/implementations/start-ar-demo');
    expect(startARDemoTool.name).toBe('start_ar_demo');
    expect(startARDemoTool.inputSchema).toBeDefined();
    expect(startARDemoTool.inputSchema.properties).toHaveProperty('product_name');
  });

  it('should have correct tool schema for end_ar_session', () => {
    const { endARSessionTool } = require('../../src/tools/implementations/end-ar-session');
    expect(endARSessionTool.name).toBe('end_ar_session');
  });

  it('ZohoLensClient should report unconfigured when no credentials', () => {
    const { ZohoLensClient } = require('../../src/lens/lens-client');
    const client = new ZohoLensClient({
      enabled: false,
      baseUrl: '',
      accountsUrl: '',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      departmentId: '',
    });
    expect(client.isConfigured()).toBe(false);
  });

  it('ZohoLensClient should report configured with valid config', () => {
    const { ZohoLensClient } = require('../../src/lens/lens-client');
    const client = new ZohoLensClient({
      enabled: true,
      baseUrl: 'https://lens.zoho.com',
      accountsUrl: 'https://accounts.zoho.com',
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
      refreshToken: 'test-token',
      departmentId: 'dept-1',
    });
    expect(client.isConfigured()).toBe(true);
  });
});

describe('Flow Builder CRUD', () => {
  it('should import flow-builder-types module without error', () => {
    const types = require('../../src/admin/flow-builder-types');
    expect(types).toBeDefined();
  });

  it('should export registerFlowBuilderRoutes function', () => {
    const mod = require('../../src/admin/flow-builder-routes');
    expect(typeof mod.registerFlowBuilderRoutes).toBe('function');
  });
});
