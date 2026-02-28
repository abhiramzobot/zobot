import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * Dentalkart Invoice API
 * POST https://apis.dentalkart.com/node_svlss/api/v1/customer-orders/shipment-invoice
 *
 * Request:  { "awb_number": "<AWB>", "order_id": "<ORDER_ID>" }
 * Response: { "pdf_link": "https://...pdf", "is_error": false }
 *
 * Returns a downloadable invoice PDF link for a shipped order.
 * Requires the AWB (tracking) number and customer-facing order ID.
 */

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'get_order_invoice', conversationId: ctx.conversationId });

  const orderNo = String(args.order_no ?? '').trim();
  const awbNumber = String(args.awb_number ?? '').trim();

  if (!orderNo) {
    return {
      success: false,
      error: 'An order number is required to fetch the invoice.',
    };
  }

  if (!awbNumber) {
    return {
      success: false,
      error: 'An AWB/tracking number is required to fetch the invoice. Use get_shipment_details first to get the AWB number for this order.',
    };
  }

  const url = env.dentalkartInvoice.baseUrl;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'platform': 'web',
      },
      body: JSON.stringify({
        awb_number: awbNumber,
        order_id: orderNo,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log.error({ status: response.status, orderNo, awbNumber }, 'Invoice API error');
      return {
        success: false,
        error: `Invoice fetch failed with status ${response.status}. The invoice may not be available for this order.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    const pdfLink = String(data?.pdf_link ?? '').trim();
    const isError = data?.is_error === true;

    if (isError || !pdfLink) {
      log.info({ orderNo, awbNumber, isError }, 'No invoice available');
      return {
        success: true,
        data: {
          found: false,
          orderNo,
          awbNumber,
          message: `No invoice is available for order ${orderNo}. The invoice may not have been generated yet.`,
        },
      };
    }

    log.info({ orderNo, awbNumber }, 'Invoice retrieved');

    return {
      success: true,
      data: {
        found: true,
        orderNo,
        awbNumber,
        invoiceUrl: pdfLink,
        message: `Invoice for order ${orderNo} is ready for download.`,
      },
    };
  } catch (err) {
    log.error({ err, orderNo, awbNumber }, 'Failed to fetch invoice');
    return {
      success: false,
      error: 'Unable to retrieve the invoice right now. Please try again in a moment.',
    };
  }
};

export const getOrderInvoiceTool: ToolDefinition = {
  name: 'get_order_invoice',
  version: '1.0.0',
  description:
    'Get the downloadable invoice PDF link for a Dentalkart order. Requires the order number AND the AWB/tracking number. ' +
    'If you don\'t have the AWB number, call get_shipment_details first to get it. ' +
    'Returns a PDF download URL that can be shared with the customer.',
  inputSchema: {
    type: 'object',
    properties: {
      order_no: {
        type: 'string',
        description: 'The customer-facing order number (e.g., "Q2593VU").',
      },
      awb_number: {
        type: 'string',
        description: 'The AWB/tracking number from the shipment (e.g., "14424050719065").',
      },
    },
    required: ['order_no', 'awb_number'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      orderNo: { type: 'string' },
      awbNumber: { type: 'string' },
      invoiceUrl: { type: 'string' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.get_order_invoice',
  cacheable: true,
  cacheTtlSeconds: 600, // Invoices don't change — 10 min cache
  handler,
};
