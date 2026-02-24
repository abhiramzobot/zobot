import { ToolDefinition } from './types';
import { logger } from '../observability/logger';

// Import core tool implementations
import { createTicketNoteTool } from './implementations/create-ticket-note';
import { handoffToHumanTool } from './implementations/handoff-to-human';

// Import Dentalkart-specific tool implementations
import { lookupCustomerOrdersTool } from './implementations/lookup-customer-orders';
import { trackShipmentTool } from './implementations/track-shipment';
import { getShipmentDetailsTool } from './implementations/get-shipment-details';
import { getShipDetailsTool } from './implementations/get-ship-details';
import { checkReturnStatusTool } from './implementations/check-return-status';
import { searchProductsTool } from './implementations/search-products';

// Legacy imports (available for backward compatibility)
import { getProductInfoTool } from './implementations/get-product-info';
import { createLeadTool } from './implementations/create-lead';
import { updateLeadTool } from './implementations/update-lead';
import { scheduleMeetingTool } from './implementations/schedule-meeting';

// Enhancement v2: Order Modification Tools
import { cancelOrderTool } from './implementations/cancel-order';
import { updateAddressTool } from './implementations/update-address';
import { changePaymentMethodTool } from './implementations/change-payment-method';

// Enhancement v2: Payment Tool
import { generatePaymentLinkTool } from './implementations/generate-payment-link';

// Enhancement v3: In-Chat Cart Tools
import { addToCartTool } from './implementations/add-to-cart';
import { viewCartTool } from './implementations/view-cart';
import { removeFromCartTool } from './implementations/remove-from-cart';

// Enhancement v4: Zoho Lens AR Demo Tools
import { startARDemoTool } from './implementations/start-ar-demo';
import { endARSessionTool } from './implementations/end-ar-session';

// Enhancement v5: Revenue-Impact Tools
import { applyCouponTool } from './implementations/apply-coupon';
import { checkCouponTool } from './implementations/check-coupon';
import { initiateRefundTool } from './implementations/initiate-refund';
import { recommendProductsTool } from './implementations/recommend-products';

// Enhancement v5: Intelligence Tools
import { analyzeImageTool } from './implementations/analyze-image';

// Enhancement v5: Engagement Tools
import { collectProductReviewTool } from './implementations/collect-review';
import { getBulkPricingTool } from './implementations/get-bulk-pricing';
import { requestQuoteTool } from './implementations/request-quote';

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn({ tool: tool.name }, 'Overwriting existing tool registration');
    }
    this.tools.set(tool.name, tool);
    logger.info({ tool: tool.name, version: tool.version }, 'Tool registered');
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Return tool definitions formatted for OpenAI function calling */
  getOpenAIFunctionDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAll().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}

/** Singleton registry */
export const toolRegistry = new ToolRegistry();

/** Register all built-in tools */
export function registerBuiltinTools(): void {
  // ─── Dentalkart Customer Service Tools ───
  toolRegistry.register(lookupCustomerOrdersTool);
  toolRegistry.register(trackShipmentTool);
  toolRegistry.register(getShipmentDetailsTool);
  toolRegistry.register(getShipDetailsTool);
  toolRegistry.register(checkReturnStatusTool);
  toolRegistry.register(searchProductsTool);

  // ─── Core Platform Tools ───
  toolRegistry.register(createTicketNoteTool);
  toolRegistry.register(handoffToHumanTool);

  // ─── Legacy Tools (backward compatibility) ───
  toolRegistry.register(createLeadTool);
  toolRegistry.register(updateLeadTool);
  toolRegistry.register(scheduleMeetingTool);
  toolRegistry.register(getProductInfoTool);

  // ─── Enhancement v2: Order Modification Tools ───
  toolRegistry.register(cancelOrderTool);
  toolRegistry.register(updateAddressTool);
  toolRegistry.register(changePaymentMethodTool);

  // ─── Enhancement v2: Payment Tool ───
  toolRegistry.register(generatePaymentLinkTool);

  // ─── Enhancement v3: In-Chat Cart Tools ───
  toolRegistry.register(addToCartTool);
  toolRegistry.register(viewCartTool);
  toolRegistry.register(removeFromCartTool);

  // ─── Enhancement v4: Zoho Lens AR Demo Tools ───
  toolRegistry.register(startARDemoTool);
  toolRegistry.register(endARSessionTool);

  // ─── Enhancement v5: Revenue-Impact Tools ───
  toolRegistry.register(applyCouponTool);
  toolRegistry.register(checkCouponTool);
  toolRegistry.register(initiateRefundTool);
  toolRegistry.register(recommendProductsTool);

  // ─── Enhancement v5: Intelligence Tools ───
  toolRegistry.register(analyzeImageTool);

  // ─── Enhancement v5: Engagement Tools ───
  toolRegistry.register(collectProductReviewTool);
  toolRegistry.register(getBulkPricingTool);
  toolRegistry.register(requestQuoteTool);

  logger.info({ count: toolRegistry.getAll().length }, 'All built-in tools registered');
}
