import { ToolDefinition, ToolHandler } from '../types';
import { env } from '../../config/env';
import { logger } from '../../observability/logger';
import { getCacheStore } from '../../cache/cache-service';
import { indexOrdersByNumber, getOrderByNumber } from '../../cache/order-index';

/**
 * VineRetail Customer Order API
 * POST /order/customerOrder
 * Looks up orders by customer phone number.
 *
 * Response structure: orderList is an array of wrapper objects.
 * Each wrapper has a single key (the orderNo) whose value is the actual order data.
 * e.g. [{"M022338958": { orderNo, status, items: [...], ... }}, ...]
 */
/**
 * Normalize Indian phone numbers to 10-digit format.
 * Handles: +91, 91 prefix, leading 0, accidental extra digits.
 * Returns an array of candidates to try (primary first, fallbacks after).
 */
function normalizeIndianPhone(raw: string): string[] {
  let digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 10) return [];

  const candidates: string[] = [];

  // 13 digits: +91 prefix (e.g. +919220441559 → 9220441559)
  if (digits.length === 12 && digits.startsWith('91')) {
    candidates.push(digits.slice(2));
  }
  // 11 digits with leading 0 (landline style: 09220441559 → 9220441559)
  else if (digits.length === 11 && digits.startsWith('0')) {
    candidates.push(digits.slice(1));
  }
  // 11 digits starting with 91 (incomplete country code: 91922044155 → 922044155X — unlikely, skip)
  // 11 digits not starting with 0: likely a typo (extra digit at start or end)
  else if (digits.length === 11) {
    // Try last 10 digits first (extra digit at beginning is more common — e.g. accidental 9 prefix)
    candidates.push(digits.slice(1));
    // Also try first 10 digits (extra digit at end)
    candidates.push(digits.slice(0, 10));
  }
  // Exact 10 digits: use as-is
  else if (digits.length === 10) {
    candidates.push(digits);
  }
  // 12+ digits with 91 prefix
  else if (digits.length > 10 && digits.startsWith('91')) {
    const stripped = digits.slice(2);
    if (stripped.length === 10) {
      candidates.push(stripped);
    } else {
      // Still too long after stripping 91 — take last 10
      candidates.push(stripped.slice(-10));
    }
  }
  // Fallback for any other length: take last 10 digits
  else if (digits.length > 10) {
    candidates.push(digits.slice(-10));
  }

  // Deduplicate while preserving order
  return [...new Set(candidates)];
}

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'lookup_customer_orders', conversationId: ctx.conversationId });

  // ── Fast path: direct order-number lookup from Redis index ──
  const orderNo = String(args.order_no ?? '').trim().toUpperCase();
  if (orderNo) {
    const cacheStore = getCacheStore();
    if (cacheStore) {
      try {
        const cachedOrder = await getOrderByNumber(cacheStore, orderNo);
        if (cachedOrder) {
          log.info({ orderNo, source: 'order_index' }, 'Order found in number index');
          return {
            success: true,
            data: {
              found: true,
              phone: cachedOrder._sourcePhone ?? '',
              customerName: cachedOrder.customerName ?? 'Unknown',
              totalOrders: 1,
              totalPages: 1,
              currentPage: 1,
              orderCount: 1,
              orders: [cachedOrder],
              _fromCache: true,
            },
          };
        }
        log.info({ orderNo }, 'Order not in index, falling back to phone lookup');
      } catch {
        // Cache read failure — proceed with phone lookup
      }
    }
  }

  // ── Standard phone-based lookup ──
  const rawPhone = String(args.phone ?? '').trim();
  const phoneCandidates = normalizeIndianPhone(rawPhone);
  if (phoneCandidates.length === 0) {
    if (orderNo) {
      return {
        success: false,
        error: `Order ${orderNo} was not found in the cache. A phone number is needed to look it up from the order system.`,
      };
    }
    return {
      success: false,
      error: 'A valid phone number (at least 10 digits) is required to look up orders.',
    };
  }

  const pageNumber = String(args.pageNumber ?? '1');
  const url = `${env.vineretail.baseUrl}/order/customerOrder`;

  // Log normalization for debugging
  if (phoneCandidates.length > 1) {
    log.info({ rawPhone, candidates: phoneCandidates }, 'Phone normalized — will try multiple candidates');
  }

  // Try each phone candidate until we find orders
  for (const phone of phoneCandidates) {
    try {
      const requestPayload: Record<string, unknown> = { phone: [phone], pageNumber };
      if (args.fromDate) requestPayload.fromDate = String(args.fromDate);
      if (args.toDate) requestPayload.toDate = String(args.toDate);

      const body = new URLSearchParams({
        ApiOwner: env.vineretail.apiOwner,
        ApiKey: env.vineretail.customerOrderApiKey || env.vineretail.apiKey,
        RequestBody: JSON.stringify(requestPayload),
      }).toString();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        log.error({ status: response.status }, 'VineRetail customerOrder API error');
        return {
          success: false,
          error: `Order lookup failed with status ${response.status}. Please try again.`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const rawOrderList = (data?.orderList as Record<string, unknown>[]) ?? [];

      // If no orders and we have more candidates, try the next one
      if (rawOrderList.length === 0) {
        if (phoneCandidates.indexOf(phone) < phoneCandidates.length - 1) {
          log.info({ phone: maskPhone(phone) }, 'No orders with this candidate, trying next');
          continue;
        }
        return {
          success: true,
          data: {
            found: false,
            phone: maskPhone(phone),
            phoneNormalized: rawPhone !== phone,
            message: `No orders found for phone number ${maskPhone(phone)}.`,
          },
        };
      }

      // Unwrap the VineRetail response structure:
      // Each element in orderList is { "orderNo": { ...order data } }
      // We extract the inner order object from each wrapper.
      const orders = rawOrderList.map((wrapper: Record<string, unknown>) => {
        const orderKey = Object.keys(wrapper)[0];
        const order = wrapper[orderKey] as Record<string, unknown>;

        // Filter out non-product items (shipping charges, handling charges)
        const allItems = Array.isArray(order.items)
          ? (order.items as Record<string, unknown>[])
          : [];
        const productItems = allItems.filter((item) => {
          const sku = String(item.sku ?? '');
          return !sku.startsWith('SHPXX') && !sku.startsWith('HNGXX');
        });

        // CRITICAL: orderNo = customer-facing order number (Q2XXXXX format).
        // The VineRetail internal ID (M0XXXXXXXX) is NEVER exposed to the LLM or customers
        // to prevent internal IDs from leaking into downstream tool calls.
        const customerOrderNo = order.extOrderNo || order.masterOrderNo || order.orderNo;
        return {
          orderNo: customerOrderNo,
          status: mapStatus(String(order.status ?? '')),
          rawStatus: order.status,
          orderDate: order.orderDate,
          updatedDate: order.updatedDate,
          customerName: order.customerName,
          totalAmount: order.orderAmount,
          subTotal: order.subTotal,
          shippingCharges: order.shippingCharges,
          paymentMethod: order.paymentMethod,
          currency: order.currency,
          items: productItems.map((item) => ({
            sku: item.sku,
            name: item.productName,
            qty: item.orderQty,
            unitPrice: item.unitPrice,
            status: item.status,
            shippedQty: item.shippedQty,
            returnQty: item.returnQty,
            imageUrl: item.imageUrl,
          })),
          shipAddress: order.shipAddress ?? null,
          discountAmount: order.discountAmount,
        };
      });

      // Index each order by number in Redis for future direct lookups (fire-and-forget)
      const cacheStore = getCacheStore();
      if (cacheStore && orders.length > 0) {
        indexOrdersByNumber(cacheStore, orders, maskPhone(phone), 180).catch(() => {});
      }

      log.info({
        phone: maskPhone(phone),
        orderCount: orders.length,
        normalized: rawPhone !== phone,
      }, 'Customer orders retrieved');

      return {
        success: true,
        data: {
          found: true,
          phone: maskPhone(phone),
          customerName: orders[0]?.customerName ?? 'Unknown',
          totalOrders: data.totalOrders,
          totalPages: data.totalPages,
          currentPage: data.currentPage,
          orderCount: orders.length,
          orders,
        },
      };
    } catch (err) {
      log.error({ err }, 'Failed to fetch customer orders from VineRetail');
      return {
        success: false,
        error: 'Unable to retrieve order information right now. Please try again in a moment.',
      };
    }
  }

  // Should not reach here, but safety fallback
  return {
    success: true,
    data: {
      found: false,
      phone: maskPhone(phoneCandidates[0]),
      message: `No orders found for phone number ${maskPhone(phoneCandidates[0])}.`,
    },
  };
};

/**
 * Normalize VineRetail order status to user-friendly labels.
 */
function mapStatus(raw: string): string {
  const lower = (raw ?? '').toLowerCase().trim();
  if (lower.includes('cancel')) return 'Cancelled';
  if (lower === 'delivered') return 'Delivered';
  if (lower.includes('delivered & returned') || lower.includes('delivered and returned')) return 'Returned';
  if (lower.includes('shipped & returned') || lower.includes('shipped and returned')) return 'Returned';
  if (lower.includes('return')) return 'RTO/Return';
  if (lower.includes('shipped complete')) return 'Shipped';
  if (lower.includes('shipped')) return 'Shipped';
  if (lower.includes('packed')) return 'Packed';
  if (lower.includes('confirmed')) return 'Confirmed';
  return raw; // Keep original if no match
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, 2) + '*'.repeat(phone.length - 4) + phone.slice(-2);
}

export const lookupCustomerOrdersTool: ToolDefinition = {
  name: 'lookup_customer_orders',
  version: '1.2.0',
  description:
    'Look up customer orders from VineRetail. Can search by phone number OR by order number (e.g. Q2593VU). ' +
    'If the customer provides an order number, pass it as order_no for fastest lookup. ' +
    'If only a phone number is available, pass it as phone. Returns order details including status, items, amounts, payment method, and shipping address. Dates are optional.',
  inputSchema: {
    type: 'object',
    properties: {
      phone: {
        type: 'string',
        description: 'Customer phone number (10+ digits). Required unless order_no is provided.',
      },
      order_no: {
        type: 'string',
        description: 'Customer-facing order number (e.g. "Q2593VU"). If provided, attempts fast cached lookup first.',
      },
      fromDate: {
        type: 'string',
        description: 'Optional start date filter. Only include if the customer specifies a date range.',
      },
      toDate: {
        type: 'string',
        description: 'Optional end date filter. Only include if the customer specifies a date range.',
      },
      pageNumber: {
        type: 'string',
        description: 'Page number for pagination. Defaults to "1".',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      phone: { type: 'string' },
      customerName: { type: 'string' },
      totalOrders: { type: 'number' },
      totalPages: { type: 'number' },
      currentPage: { type: 'number' },
      orderCount: { type: 'number' },
      orders: { type: 'array' },
      message: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 15,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.lookup_customer_orders',
  cacheable: true,
  cacheTtlSeconds: 180,
  handler,
};
