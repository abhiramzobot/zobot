import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';

/**
 * VineRetail Shipment Detail API
 * POST /order/shipmentDetail
 *
 * Actual response shape:
 * {
 *   "orders": [
 *     {
 *       "orderNo": "Q2593VU",
 *       "shipdetail": [
 *         {
 *           "tracking_number": "17502636067048",
 *           "obExtTransporterName": "4~Delhivery Air - Delhi",
 *           "shipdate": "23/10/2024 21:29",
 *           "delivereddate": "27/10/2024 12:58",
 *           "pack_date": "23/10/2024 17:34",
 *           "status": "DELIVERED",
 *           "invoiceNo": "DK-IN202410-3206",
 *           "item": [
 *             {
 *               "sku": "DK-10175",
 *               "itemName": "Mani H-Files 31mm 15",
 *               "price": 234.0,
 *               "status": "DELIVERED",
 *               "shippedQty": "1",
 *               "returnedQty": "0",
 *               "deliveredQty": "1",
 *               "udf5": "EDD Dispatch: 24/10/2024 18:00",
 *               "udf8": "EDD Delivery: 27/10/2024 23:59"
 *             }
 *           ],
 *           "dimensions": [{ "weight": 200.0, "length": 15.0, "width": 12.0, "height": 6.0 }]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

/**
 * Carrier mapping from Clickpost cpId.
 * obExtTransporterName format: "cpId~carrierName"
 */
const CARRIER_MAP: Record<string, string> = {
  '1': 'Blue Dart',
  '2': 'Ecom Express',
  '4': 'Delhivery',
  '6': 'Xpressbees',
  '7': 'Shadowfax',
  '8': 'DTDC',
};

/**
 * Parse "cpId~carrierName" format from obExtTransporterName.
 * Returns { cpId, carrierName }.
 */
function parseTransporter(raw: string): { cpId: string; carrierName: string } {
  if (!raw) return { cpId: '', carrierName: 'Unknown' };
  const parts = raw.split('~');
  const cpId = parts[0]?.trim() ?? '';
  const carrierName = CARRIER_MAP[cpId] || parts[1]?.trim() || raw;
  return { cpId, carrierName };
}

/**
 * Parse EDD string from udf fields.
 * Input: "EDD Dispatch: 24/10/2024 18:00" or "EDD Delivery: 27/10/2024 23:59"
 * Returns the date portion, or null.
 */
function parseEdd(udf: unknown): string | null {
  if (!udf || typeof udf !== 'string') return null;
  const match = udf.match(/:\s*(.+)/);
  return match ? match[1].trim() : null;
}

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'get_shipment_details', conversationId: ctx.conversationId });

  const orderNo = String(args.order_no ?? '').trim();
  if (!orderNo) {
    return {
      success: false,
      error: 'An order number is required to fetch shipment details.',
    };
  }

  const url = `${env.vineretail.baseUrl}/order/shipmentDetail`;
  const requestBody = JSON.stringify({ order_no: [orderNo] });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ApiKey: env.vineretail.shipmentDetailApiKey || env.vineretail.apiKey,
        ApiOwner: env.vineretail.apiOwner,
      },
      body: requestBody,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      log.error({ status: response.status, orderNo }, 'VineRetail shipmentDetail API error');
      return {
        success: false,
        error: `Shipment detail lookup failed with status ${response.status}. Please verify the order number.`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Actual structure: data.orders[] → each has .shipdetail[]
    const orders = Array.isArray(data?.orders) ? data.orders as Record<string, unknown>[] : [];

    if (orders.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          orderNo,
          message: `No shipment details found for order ${orderNo}. The order may not have been shipped yet.`,
        },
      };
    }

    // Find the matching order (API may return multiple if multiple order_nos were sent)
    const matchedOrder = orders.find(
      (o) => String(o.orderNo ?? '').toUpperCase() === orderNo.toUpperCase(),
    ) ?? orders[0];

    const shipDetails = Array.isArray(matchedOrder.shipdetail)
      ? matchedOrder.shipdetail as Record<string, unknown>[]
      : [];

    if (shipDetails.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          orderNo,
          message: `Order ${orderNo} exists but has no shipment details yet. It may still be processing.`,
        },
      };
    }

    // Transform shipment data
    const shipments = shipDetails.map((ship) => {
      const { cpId, carrierName } = parseTransporter(String(ship.obExtTransporterName ?? ''));

      // Parse items — filter out shipping/handling charge line items
      const rawItems = Array.isArray(ship.item) ? ship.item as Record<string, unknown>[] : [];
      const items = rawItems
        .filter((item) => {
          const sku = String(item.sku ?? '');
          return !sku.startsWith('SHPXX') && !sku.startsWith('HNGXX');
        })
        .map((item) => ({
          sku: item.sku,
          name: item.itemName,
          price: item.price,
          status: item.status,
          shippedQty: item.shippedQty,
          returnedQty: item.returnedQty,
          deliveredQty: item.deliveredQty,
          eddDispatch: parseEdd(item.udf5),
          eddDelivery: parseEdd(item.udf8),
        }));

      // Parse dimensions
      const rawDimensions = Array.isArray(ship.dimensions)
        ? ship.dimensions as Record<string, unknown>[]
        : [];
      const dimensions = rawDimensions.length > 0
        ? {
            weight: rawDimensions[0].weight,
            length: rawDimensions[0].length,
            width: rawDimensions[0].width ?? rawDimensions[0].breadth,
            height: rawDimensions[0].height,
          }
        : undefined;

      return {
        trackingNumber: ship.tracking_number ?? '',
        cpId,
        carrierName,
        status: ship.status ?? 'Unknown',
        invoiceNo: ship.invoiceNo ?? '',
        packDate: ship.pack_date ?? null,
        shipDate: ship.shipdate ?? null,
        deliveredDate: ship.delivereddate ?? null,
        items,
        dimensions,
        itemCount: items.length,
      };
    });

    // ── Auto-fetch invoice URLs for each shipment (parallel, best-effort) ──
    const invoiceApiUrl = env.dentalkartInvoice.baseUrl;
    const shipmentsWithInvoice = await Promise.all(
      shipments.map(async (ship) => {
        if (!ship.trackingNumber) return ship;
        try {
          const invResp = await fetch(invoiceApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: '*/*', platform: 'web' },
            body: JSON.stringify({ awb_number: ship.trackingNumber, order_id: orderNo }),
            signal: AbortSignal.timeout(5000),
          });
          if (invResp.ok) {
            const invData = (await invResp.json()) as Record<string, unknown>;
            const pdfLink = String(invData?.pdf_link ?? '').trim();
            if (pdfLink && invData?.is_error !== true) {
              return { ...ship, invoiceUrl: pdfLink };
            }
          }
        } catch {
          // Invoice fetch failed — not critical, return shipment without invoice
        }
        return ship;
      }),
    );

    log.info({
      orderNo,
      shipmentCount: shipmentsWithInvoice.length,
      trackingNumbers: shipmentsWithInvoice.map((s) => s.trackingNumber),
    }, 'Shipment details retrieved');

    return {
      success: true,
      data: {
        found: true,
        orderNo,
        _internalOrderNo: matchedOrder.orderNo ?? orderNo,
        shipmentCount: shipmentsWithInvoice.length,
        shipments: shipmentsWithInvoice,
      },
    };
  } catch (err) {
    log.error({ err, orderNo }, 'Failed to fetch shipment details from VineRetail');
    return {
      success: false,
      error: 'Unable to retrieve shipment details right now. Please try again in a moment.',
    };
  }
};

export const getShipmentDetailsTool: ToolDefinition = {
  name: 'get_shipment_details',
  version: '1.1.0',
  description:
    'Get shipment details for an order from VineRetail. Returns AWB/tracking numbers, courier info (carrier name & Clickpost cpId), shipping status, ship/pack/delivery dates, invoice number, and item breakdown with EDD. Use when you have an order number and need to find its shipment/tracking details. The cpId can be passed to track_shipment for live Clickpost tracking.',
  inputSchema: {
    type: 'object',
    properties: {
      order_no: {
        type: 'string',
        description: 'The Dentalkart order number (e.g., "Q2593VU").',
      },
    },
    required: ['order_no'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      orderNo: { type: 'string' },
      shipmentCount: { type: 'number' },
      shipments: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.get_shipment_details',
  cacheable: true,
  cacheTtlSeconds: 300,
  handler,
};
