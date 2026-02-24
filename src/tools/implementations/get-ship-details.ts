import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * VineRetail Ship Detail API
 * POST /order/shipDetail
 * Retrieves detailed ship-level information by AWB number.
 */
const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'get_ship_details', conversationId: ctx.conversationId });

  const awbNo = String(args.awb_no ?? '').trim();
  if (!awbNo) {
    return {
      success: false,
      error: 'An AWB (tracking) number is required to fetch ship details.',
    };
  }

  const requestBody = JSON.stringify({ awbno: awbNo });

  const body = new URLSearchParams({
    ApiOwner: env.vineretail.apiOwner,
    ApiKey: env.vineretail.shipDetailApiKey || env.vineretail.apiKey,
    RequestBody: requestBody,
  }).toString();

  const url = `${env.vineretail.baseUrl}/order/shipDetail`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error({ status: response.status, awbNo }, 'VineRetail shipDetail API error');
      return {
        success: false,
        error: `Ship detail lookup failed with status ${response.status}. Please verify the AWB number.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // VineRetail wraps in shipdetail or similar
    const shipInfo = data?.shipdetail ?? data?.shipDetail ?? data?.result ?? data;

    // Check if we got valid data
    if (!shipInfo || (Array.isArray(shipInfo) && shipInfo.length === 0)) {
      return {
        success: true,
        data: {
          found: false,
          awbNo,
          message: `No ship details found for AWB ${awbNo}. Please verify the tracking number.`,
        },
      };
    }

    // Normalize — could be a single object or array
    const details = Array.isArray(shipInfo) ? shipInfo : [shipInfo];

    const shipDetails = details.map((ship: Record<string, unknown>) => ({
      awbNo: ship.awb_no ?? ship.tracking_number ?? awbNo,
      orderNo: ship.order_no ?? ship.orderNo,
      transporter: ship.transporter ?? ship.courier ?? ship.courier_name,
      status: ship.status ?? ship.shipment_status,
      shipDate: ship.ship_date ?? ship.shipDate,
      deliveryDate: ship.delivery_date ?? ship.deliveryDate,
      weight: ship.weight,
      dimensions: ship.dimensions,
      invoiceNo: ship.invoice_no ?? ship.invoiceNo,
      invoiceDate: ship.invoice_date ?? ship.invoiceDate,
      items: Array.isArray(ship.items)
        ? (ship.items as Record<string, unknown>[]).map((item) => ({
            sku: item.skuCode ?? item.sku,
            name: item.itemName ?? item.name,
            qty: item.qty ?? item.quantity,
            amount: item.amt ?? item.amount,
          }))
        : [],
    }));

    log.info({ awbNo, resultCount: shipDetails.length }, 'Ship details retrieved');

    return {
      success: true,
      data: {
        found: true,
        awbNo,
        shipDetails,
      },
    };
  } catch (err) {
    log.error({ err, awbNo }, 'Failed to fetch ship details from VineRetail');
    return {
      success: false,
      error: 'Unable to retrieve ship details right now. Please try again in a moment.',
    };
  }
};

export const getShipDetailsTool: ToolDefinition = {
  name: 'get_ship_details',
  version: '1.0.0',
  description:
    'Get detailed ship-level information from VineRetail by AWB number. Returns order association, courier, invoice, weight, and item details. Use when you have an AWB number and need full shipping/invoice details.',
  inputSchema: {
    type: 'object',
    properties: {
      awb_no: {
        type: 'string',
        description: 'The AWB (Air Waybill / tracking) number.',
      },
    },
    required: ['awb_no'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      awbNo: { type: 'string' },
      shipDetails: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.get_ship_details',
  handler,
};
