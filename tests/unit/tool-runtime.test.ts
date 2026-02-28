import { ToolRuntime } from '../../src/tools/runtime';
import { toolRegistry, registerBuiltinTools } from '../../src/tools/registry';
import { ToolContext, ToolDefinition } from '../../src/tools/types';
import { configService } from '../../src/config/config-service';

describe('ToolRuntime', () => {
  let runtime: ToolRuntime;
  const ctx: ToolContext = {
    tenantId: 'default',
    channel: 'web',
    conversationId: 'conv-test',
    visitorId: 'visitor-test',
    requestId: 'req-test',
  };

  beforeAll(() => {
    registerBuiltinTools();
  });

  beforeEach(() => {
    runtime = new ToolRuntime();
  });

  describe('tool existence', () => {
    it('should reject unknown tools', async () => {
      const result = await runtime.execute('nonexistent_tool', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should have all Dentalkart tools registered', () => {
      expect(toolRegistry.has('lookup_customer_orders')).toBe(true);
      expect(toolRegistry.has('track_shipment')).toBe(true);
      expect(toolRegistry.has('get_shipment_details')).toBe(true);
      expect(toolRegistry.has('get_ship_details')).toBe(true);
      expect(toolRegistry.has('check_return_status')).toBe(true);
      expect(toolRegistry.has('search_products')).toBe(true);
    });

    it('should have core tools registered', () => {
      expect(toolRegistry.has('create_ticket_note')).toBe(true);
      expect(toolRegistry.has('handoff_to_human')).toBe(true);
    });

    it('should have legacy tools registered', () => {
      expect(toolRegistry.has('create_lead')).toBe(true);
      expect(toolRegistry.has('update_lead')).toBe(true);
      expect(toolRegistry.has('schedule_meeting')).toBe(true);
      expect(toolRegistry.has('get_product_info')).toBe(true);
    });
  });

  describe('schema validation', () => {
    it('should reject invalid input for search_products (missing required query)', async () => {
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(true);
      const result = await runtime.execute('search_products', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      (configService.isToolEnabled as jest.Mock).mockRestore();
    });

    it('should accept lookup_customer_orders with no required args (phone and order_no are optional)', async () => {
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(true);
      // With required: [], empty args should pass schema validation
      // (handler-level validation will still reject if neither phone nor order_no is provided)
      const result = await runtime.execute('lookup_customer_orders', {}, ctx);
      // Should reach the handler (not fail at schema validation)
      // The handler will return an error about needing a phone number
      expect(result.error).not.toContain('Invalid input');
      (configService.isToolEnabled as jest.Mock).mockRestore();
    });

    it('should accept valid input for get_product_info', async () => {
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(true);
      const result = await runtime.execute('get_product_info', { query: 'dental chair' }, ctx);
      expect(result.success).toBe(true);
      (configService.isToolEnabled as jest.Mock).mockRestore();
    });
  });

  describe('channel allowlist', () => {
    it('should allow tool on enabled channel', async () => {
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(true);
      const result = await runtime.execute('get_product_info', { query: 'test' }, ctx);
      expect(result.success).toBe(true);
      (configService.isToolEnabled as jest.Mock).mockRestore();
    });

    it('should reject tool on disabled channel when tenant config excludes it', async () => {
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(false);

      const result = await runtime.execute('get_product_info', { query: 'test' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not currently enabled');

      (configService.isToolEnabled as jest.Mock).mockRestore();
    });
  });

  describe('timeout', () => {
    it('should timeout slow tools', async () => {
      // Register a slow tool for testing
      const slowTool: ToolDefinition = {
        name: 'slow_test_tool',
        version: '1.0.0',
        description: 'A slow test tool',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        outputSchema: { type: 'object' },
        authLevel: 'none',
        rateLimitPerMinute: 100,
        allowedChannels: ['web', 'whatsapp', 'business_chat'],
        featureFlagKey: 'tool.slow_test_tool',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20_000));
          return { success: true };
        },
      };
      toolRegistry.register(slowTool);

      // Need to also enable it in the config
      jest.spyOn(configService, 'isToolEnabled').mockReturnValue(true);

      const result = await runtime.execute('slow_test_tool', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');

      (configService.isToolEnabled as jest.Mock).mockRestore();
    }, 45_000);
  });

  describe('rate limiting', () => {
    it('should enforce per-tool rate limits', async () => {
      // handoff_to_human has rateLimitPerMinute: 5
      const rateCtx = { ...ctx, conversationId: 'rate-test-handoff' };

      for (let i = 0; i < 5; i++) {
        await runtime.execute('handoff_to_human', { reason: 'test' }, rateCtx);
      }

      // 6th call should be rate-limited
      const result = await runtime.execute('handoff_to_human', { reason: 'test' }, rateCtx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
    });
  });

  describe('OpenAI function definitions', () => {
    it('should generate valid function definitions for all registered tools', () => {
      const defs = toolRegistry.getOpenAIFunctionDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(8); // At least 6 Dentalkart + 2 core

      // Each definition should have the correct structure
      for (const def of defs) {
        expect(def.type).toBe('function');
        expect(def.function.name).toBeDefined();
        expect(def.function.description).toBeDefined();
        expect(def.function.parameters).toBeDefined();
      }

      // Verify Dentalkart tools are present
      const names = defs.map((d) => d.function.name);
      expect(names).toContain('lookup_customer_orders');
      expect(names).toContain('track_shipment');
      expect(names).toContain('search_products');
      expect(names).toContain('check_return_status');
    });
  });
});
