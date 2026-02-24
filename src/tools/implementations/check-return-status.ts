import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * Dentalkart Admin Return Status API
 * GET /return/admin-api/v1/returns/approved-returns?page=1&size=50&order_id=...
 * Checks the return/refund status for a given order ID.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'check_return_status', conversationId: ctx.conversationId });

  const orderId = String(args.order_id ?? '').trim();
  if (!orderId) {
    return {
      success: false,
      error: 'An order ID is required to check return status.',
    };
  }

  const page = String(args.page ?? '1');
  const size = String(args.size ?? '50');

  const params = new URLSearchParams({
    page,
    size,
    order_id: orderId,
  });

  const url = `${env.dentalkartAdmin.baseUrl}/return/admin-api/v1/returns/approved-returns?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': env.dentalkartAdmin.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error({ status: response.status, orderId }, 'Dentalkart return status API error');
      return {
        success: false,
        error: `Return status lookup failed with status ${response.status}. Please verify the order ID.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // The API returns an array of return entries, or wraps them in content/data
    const returns = data?.content ?? data?.data ?? (Array.isArray(data) ? data : []);

    if (!Array.isArray(returns) || returns.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          orderId,
          message: `No return requests found for order ${orderId}. If you recently submitted a return, it may take some time to appear.`,
        },
      };
    }

    // Transform return data into a concise format
    const returnItems = returns.map((ret: Record<string, unknown>) => ({
      returnNo: ret.return_no ?? ret.returnNo,
      action: ret.action ?? ret.type, // e.g., "Return", "Replace", "Refund"
      status: ret.status,
      refundStatus: ret.refund_status ?? ret.refundStatus,
      refundAmount: ret.refund_amount ?? ret.refundAmount,
      refundMode: ret.refund_mode ?? ret.refundMode,
      awb: ret.awb ?? ret.tracking_number,
      courierPartner: ret.courier_partner ?? ret.courierPartner,
      createdAt: ret.created_at ?? ret.createdAt,
      updatedAt: ret.updated_at ?? ret.updatedAt,
      returnItems: Array.isArray(ret.returnItems ?? ret.return_items)
        ? ((ret.returnItems ?? ret.return_items) as Record<string, unknown>[]).map((item) => ({
            sku: item.sku ?? item.skuCode,
            name: item.name ?? item.itemName ?? item.product_name,
            qty: item.qty ?? item.quantity,
            reason: item.reason ?? item.return_reason,
          }))
        : [],
    }));

    log.info({ orderId, returnCount: returnItems.length }, 'Return status retrieved');

    return {
      success: true,
      data: {
        found: true,
        orderId,
        returnCount: returnItems.length,
        returns: returnItems,
      },
    };
  } catch (err) {
    log.error({ err, orderId }, 'Failed to fetch return status from Dentalkart admin API');
    return {
      success: false,
      error: 'Unable to retrieve return status right now. Please try again in a moment.',
    };
  }
};

export const checkReturnStatusTool: ToolDefinition = {
  name: 'check_return_status',
  version: '1.0.0',
  description:
    'Check the return/refund status for a Dentalkart order. Returns details about return requests including refund status, refund amount, return AWB, and item details. Use when customer asks about return status, refund status, or replacement status.',
  inputSchema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'string',
        description: 'The Dentalkart order ID to check returns for.',
      },
      page: {
        type: 'string',
        description: 'Page number for pagination. Defaults to "1".',
      },
      size: {
        type: 'string',
        description: 'Number of results per page. Defaults to "50".',
      },
    },
    required: ['order_id'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      orderId: { type: 'string' },
      returnCount: { type: 'number' },
      returns: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.check_return_status',
  handler,
};
