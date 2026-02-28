import { ToolContext } from '../../src/tools/types';

// Mock fetch globally before importing tools
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock env before tool imports
jest.mock('../../src/config/env', () => ({
  env: {
    vineretail: {
      baseUrl: 'https://mock.vineretail.com/api/v1',
      apiKey: 'test-api-key',
      apiOwner: 'test-api-owner',
      customerOrderApiKey: 'test-api-key',
      shipmentDetailApiKey: 'test-api-key',
    },
    clickpost: {
      baseUrl: 'https://mock.clickpost.in/api/v2',
      apiKey: 'test-cp-key',
      username: 'dentalkart',
    },
    dentalkartAdmin: {
      baseUrl: 'https://mock.adminapis.dentalkart.com',
      apiKey: 'test-admin-key',
    },
    dentalkartSearch: {
      baseUrl: 'https://mock.search.dentalkart.com/api/v1',
    },
  },
}));

// Mock logger
jest.mock('../../src/observability/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock cache-service for order_no lookup tests
const mockGetCacheStore = jest.fn().mockReturnValue(null);
jest.mock('../../src/cache/cache-service', () => ({
  getCacheStore: () => mockGetCacheStore(),
}));

// Mock order-index
const mockGetOrderByNumber = jest.fn().mockResolvedValue(null);
const mockIndexOrdersByNumber = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/cache/order-index', () => ({
  getOrderByNumber: (...args: unknown[]) => mockGetOrderByNumber(...args),
  indexOrdersByNumber: (...args: unknown[]) => mockIndexOrdersByNumber(...args),
}));

import { lookupCustomerOrdersTool } from '../../src/tools/implementations/lookup-customer-orders';
import { trackShipmentTool } from '../../src/tools/implementations/track-shipment';
import { getShipmentDetailsTool } from '../../src/tools/implementations/get-shipment-details';
import { getShipDetailsTool } from '../../src/tools/implementations/get-ship-details';
import { checkReturnStatusTool } from '../../src/tools/implementations/check-return-status';
import { searchProductsTool } from '../../src/tools/implementations/search-products';

const ctx: ToolContext = {
  tenantId: 'default',
  channel: 'web',
  conversationId: 'conv-test',
  visitorId: 'visitor-test',
  requestId: 'req-test',
};

describe('Dentalkart Tools', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ──────────────────────────────────────────────
  // lookup_customer_orders
  // ──────────────────────────────────────────────
  describe('lookup_customer_orders', () => {
    it('should have correct metadata', () => {
      expect(lookupCustomerOrdersTool.name).toBe('lookup_customer_orders');
      expect(lookupCustomerOrdersTool.version).toBe('1.2.0');
      expect(lookupCustomerOrdersTool.authLevel).toBe('service');
      // phone and order_no are both optional now (either can be provided)
      expect(lookupCustomerOrdersTool.inputSchema.required).toEqual([]);
      expect(lookupCustomerOrdersTool.inputSchema.properties).toHaveProperty('order_no');
      expect(lookupCustomerOrdersTool.cacheable).toBe(true);
      expect(lookupCustomerOrdersTool.cacheTtlSeconds).toBe(180);
    });

    it('should reject invalid phone numbers', async () => {
      const result = await lookupCustomerOrdersTool.handler({ phone: '123' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid phone number');
    });

    it('should return orders on successful API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderList: [
            {
              // VineRetail wraps each order by its internal orderNo key
              'M022338958': {
                orderNo: 'M022338958',       // internal VineRetail ID (should NOT be shown to customer)
                extOrderNo: 'Q2593VU',        // customer-facing order number
                status: 'Delivered',
                orderDate: '2025-01-15',
                orderAmount: 5500,
                paymentMethod: 'Prepaid',
                customerName: 'Dr. Test',
                items: [
                  { sku: 'SKU001', productName: 'Dental Composite', orderQty: 2, unitPrice: 2750, status: 'Delivered' },
                ],
                shipAddress: { name: 'Dr. Test', city: 'Delhi', state: 'Delhi', pincode: '110001' },
              },
            },
          ],
        }),
      });

      const result = await lookupCustomerOrdersTool.handler({ phone: '9876543210' }, ctx);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.orderCount).toBe(1);
      const order = (data.orders as Array<Record<string, unknown>>)[0];
      // orderNo should be the CUSTOMER-FACING number, not internal M0XXXXXXXX
      expect(order.orderNo).toBe('Q2593VU');
      // _internalId is no longer exposed to prevent LLM from using it in downstream tools
      expect(order._internalId).toBeUndefined();
    });

    it('should handle empty order list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderList: [] }),
      });

      const result = await lookupCustomerOrdersTool.handler({ phone: '9876543210' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await lookupCustomerOrdersTool.handler({ phone: '9876543210' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await lookupCustomerOrdersTool.handler({ phone: '9876543210' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unable to retrieve');
    });

    it('should normalize +91 prefix and strip non-digit characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderList: [] }),
      });

      await lookupCustomerOrdersTool.handler({ phone: '+91-9876-543210' }, ctx);
      expect(mockFetch).toHaveBeenCalled();
      const callBody = mockFetch.mock.calls[0][1].body;
      // +91-9876-543210 → digits 919876543210 (12 digits, starts with 91) → normalized to 9876543210
      expect(callBody).toContain('9876543210');
      expect(callBody).not.toContain('919876543210');
    });

    it('should handle 11-digit typo by trying last 10 and first 10 digits', async () => {
      // First attempt (last 10 digits: 2204415599) returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderList: [] }),
      });
      // Second attempt (first 10 digits: 9220441559) returns orders
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderList: [
            {
              'Q999': {
                orderNo: 'Q999',
                status: 'Delivered',
                orderDate: '2025-02-01',
                orderAmount: 1000,
                customerName: 'Test',
                items: [],
              },
            },
          ],
        }),
      });

      const result = await lookupCustomerOrdersTool.handler({ phone: '92204415599' }, ctx);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
    });

    it('should reject phone numbers shorter than 10 digits', async () => {
      const result = await lookupCustomerOrdersTool.handler({ phone: '98765' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid phone number');
    });

    it('should normalize 10-digit phone as-is', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderList: [] }),
      });

      await lookupCustomerOrdersTool.handler({ phone: '9876543210' }, ctx);
      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('9876543210');
    });

    it('should handle 11-digit with leading 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderList: [] }),
      });

      await lookupCustomerOrdersTool.handler({ phone: '09876543210' }, ctx);
      const callBody = mockFetch.mock.calls[0][1].body;
      // 09876543210 → 11 digits starting with 0 → normalized to 9876543210
      expect(callBody).toContain('9876543210');
    });

    // ── order_no parameter tests ──

    it('should return cached order when order_no matches Redis index', async () => {
      const cachedOrder = {
        orderNo: 'Q2593VU',
        status: 'Delivered',
        customerName: 'Dr. Test',
        _sourcePhone: '98****10',
      };
      const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), has: jest.fn(), clear: jest.fn(), stats: jest.fn() };
      mockGetCacheStore.mockReturnValue(mockCache);
      mockGetOrderByNumber.mockResolvedValueOnce(cachedOrder);

      const result = await lookupCustomerOrdersTool.handler({ order_no: 'Q2593VU' }, ctx);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.orderCount).toBe(1);
      expect(data._fromCache).toBe(true);
      expect((data.orders as any[])[0].orderNo).toBe('Q2593VU');
      // Should NOT call fetch
      expect(mockFetch).not.toHaveBeenCalled();

      mockGetCacheStore.mockReturnValue(null);
    });

    it('should fall back to phone lookup when order_no is not in cache', async () => {
      const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), has: jest.fn(), clear: jest.fn(), stats: jest.fn() };
      mockGetCacheStore.mockReturnValue(mockCache);
      mockGetOrderByNumber.mockResolvedValueOnce(null);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orderList: [{
            'M022338958': {
              orderNo: 'M022338958',
              extOrderNo: 'Q2593VU',
              status: 'Delivered',
              orderDate: '2025-01-15',
              orderAmount: 5500,
              customerName: 'Dr. Test',
              items: [],
            },
          }],
        }),
      });

      const result = await lookupCustomerOrdersTool.handler(
        { order_no: 'Q2593VU', phone: '9876543210' },
        ctx,
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      // Should have called fetch for phone lookup
      expect(mockFetch).toHaveBeenCalled();

      mockGetCacheStore.mockReturnValue(null);
    });

    it('should return error when order_no misses cache and no phone provided', async () => {
      const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), has: jest.fn(), clear: jest.fn(), stats: jest.fn() };
      mockGetCacheStore.mockReturnValue(mockCache);
      mockGetOrderByNumber.mockResolvedValueOnce(null);

      const result = await lookupCustomerOrdersTool.handler({ order_no: 'Q2593VU' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Q2593VU');
      expect(result.error).toContain('phone number');

      mockGetCacheStore.mockReturnValue(null);
    });

    it('should handle cache read failure gracefully for order_no', async () => {
      const mockCache = { get: jest.fn(), set: jest.fn(), del: jest.fn(), has: jest.fn(), clear: jest.fn(), stats: jest.fn() };
      mockGetCacheStore.mockReturnValue(mockCache);
      mockGetOrderByNumber.mockRejectedValueOnce(new Error('Redis down'));

      // Should fall through to phone validation
      const result = await lookupCustomerOrdersTool.handler({ order_no: 'Q2593VU' }, ctx);

      expect(result.success).toBe(false);
      // Falls through to phone validation which fails since no phone provided
      expect(result.error).toContain('phone number');

      mockGetCacheStore.mockReturnValue(null);
    });
  });

  // ──────────────────────────────────────────────
  // track_shipment
  // ──────────────────────────────────────────────
  describe('track_shipment', () => {
    it('should have correct metadata', () => {
      expect(trackShipmentTool.name).toBe('track_shipment');
      expect(trackShipmentTool.inputSchema.required).toContain('waybill');
    });

    it('should reject empty waybill', async () => {
      const result = await trackShipmentTool.handler({ waybill: '' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('AWB');
    });

    it('should return tracking info on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { status: 200 },
          result: {
            latest_status: {
              clickpost_status_description: 'In Transit',
              clickpost_status_code: 6,
              timestamp: '2025-01-20T10:00:00Z',
              clickpost_city: 'Mumbai',
            },
            scans: [
              {
                clickpost_status_description: 'In Transit',
                clickpost_city: 'Mumbai',
                timestamp: '2025-01-20T10:00:00Z',
              },
              {
                clickpost_status_description: 'Picked Up',
                clickpost_city: 'Delhi',
                timestamp: '2025-01-19T15:00:00Z',
              },
            ],
            additional: {
              courier_partner_name: 'Delhivery',
              edd_stamp: '2025-01-22',
            },
          },
        }),
      });

      const result = await trackShipmentTool.handler({ waybill: 'DL1234567890' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      const tracking = data.tracking as Record<string, unknown>;
      expect(tracking.currentStatus).toBe('In Transit');
      expect(tracking.courierPartner).toBe('Delhivery');
      expect(tracking.expectedDelivery).toBe('2025-01-22');
    });

    it('should handle not-found waybill', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { status: 404 },
          result: {},
        }),
      });

      const result = await trackShipmentTool.handler({ waybill: 'INVALID123' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // get_shipment_details
  // ──────────────────────────────────────────────
  describe('get_shipment_details', () => {
    it('should have correct metadata', () => {
      expect(getShipmentDetailsTool.name).toBe('get_shipment_details');
      expect(getShipmentDetailsTool.inputSchema.required).toContain('order_no');
    });

    it('should reject empty order number', async () => {
      const result = await getShipmentDetailsTool.handler({ order_no: '' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('order number');
    });

    it('should return shipment details on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orders: [
            {
              orderNo: 'Q2593VU',
              shipdetail: [
                {
                  tracking_number: 'DL1234567890',
                  obExtTransporterName: '4~Delhivery Air - Delhi',
                  status: 'Shipped',
                  shipdate: '2025-01-18',
                  item: [
                    { sku: 'SKU001', itemName: 'Dental Composite', shippedQty: 2 },
                  ],
                },
              ],
            },
          ],
        }),
      });

      const result = await getShipmentDetailsTool.handler({ order_no: 'Q2593VU' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.shipmentCount).toBe(1);
    });

    it('should handle empty shipment details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orders: [] }),
      });

      const result = await getShipmentDetailsTool.handler({ order_no: 'NOSHIP' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // get_ship_details
  // ──────────────────────────────────────────────
  describe('get_ship_details', () => {
    it('should have correct metadata', () => {
      expect(getShipDetailsTool.name).toBe('get_ship_details');
      expect(getShipDetailsTool.inputSchema.required).toContain('awb_no');
    });

    it('should reject empty AWB', async () => {
      const result = await getShipDetailsTool.handler({ awb_no: '' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('AWB');
    });

    it('should return ship details on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shipdetail: [
            {
              awb_no: 'DL1234567890',
              order_no: 'Q2593VU',
              transporter: 'Delhivery',
              status: 'Delivered',
              invoice_no: 'INV-001',
              weight: '1.5kg',
              items: [{ skuCode: 'SKU001', itemName: 'Dental Composite', qty: 2, amt: 2750 }],
            },
          ],
        }),
      });

      const result = await getShipDetailsTool.handler({ awb_no: 'DL1234567890' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      const details = data.shipDetails as Array<Record<string, unknown>>;
      expect(details[0].orderNo).toBe('Q2593VU');
      expect(details[0].invoiceNo).toBe('INV-001');
    });
  });

  // ──────────────────────────────────────────────
  // check_return_status
  // ──────────────────────────────────────────────
  describe('check_return_status', () => {
    it('should have correct metadata', () => {
      expect(checkReturnStatusTool.name).toBe('check_return_status');
      expect(checkReturnStatusTool.inputSchema.required).toContain('order_id');
    });

    it('should reject empty order ID', async () => {
      const result = await checkReturnStatusTool.handler({ order_id: '' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('order ID');
    });

    it('should return return status on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              return_no: 'RET-001',
              action: 'Return',
              status: 'Approved',
              refund_status: 'Processed',
              refund_amount: 2750,
              refund_mode: 'Bank',
              awb: 'RT1234567890',
              courier_partner: 'Delhivery',
              created_at: '2025-01-20',
              returnItems: [
                { sku: 'SKU001', name: 'Dental Composite', qty: 1, reason: 'Damaged' },
              ],
            },
          ],
        }),
      });

      const result = await checkReturnStatusTool.handler({ order_id: 'Q2593VU' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.returnCount).toBe(1);
      const returns = data.returns as Array<Record<string, unknown>>;
      expect(returns[0].returnNo).toBe('RET-001');
      expect(returns[0].refundStatus).toBe('Processed');
    });

    it('should handle no returns found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [] }),
      });

      const result = await checkReturnStatusTool.handler({ order_id: 'NORET' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // search_products
  // ──────────────────────────────────────────────
  describe('search_products', () => {
    it('should have correct metadata', () => {
      expect(searchProductsTool.name).toBe('search_products');
      expect(searchProductsTool.inputSchema.required).toContain('query');
    });

    it('should reject empty query', async () => {
      const result = await searchProductsTool.handler({ query: '' }, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('search query');
    });

    it('should return products on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: {
            hits: [
              {
                product_id: '12345',
                name: 'Dental Composite 3M Filtek Z350',
                sku: 'DK-COMP-001',
                brand: '3M',
                price: 3500,
                selling_price: 2800,
                discount: { value: 20, label: '20% Off' },
                is_in_stock: true,
                short_description: 'Premium nano-hybrid composite',
                url_key: 'dental-composite-3m-filtek-z350',
                media: { web_image: 'https://cdn.dentalkart.com/img/comp.jpg' },
              },
              {
                product_id: '12346',
                name: 'GC Fuji IX GP Capsule',
                sku: 'DK-GIC-001',
                brand: 'GC',
                price: 4200,
                selling_price: 3800,
                discount: { value: 10, label: '10% Off' },
                is_in_stock: true,
                short_description: 'Glass ionomer cement capsule',
                url_key: 'gc-fuji-ix-gp-capsule',
              },
            ],
          },
        }),
      });

      const result = await searchProductsTool.handler({ query: 'dental composite' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.resultCount).toBe(2);
      const products = data.products as Array<Record<string, unknown>>;
      expect(products[0].name).toBe('Dental Composite 3M Filtek Z350');
      expect(products[0].sellingPrice).toBe(2800);
    });

    it('should handle no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [] } }),
      });

      const result = await searchProductsTool.handler({ query: 'xyznonexistent' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.found).toBe(false);
    });

    it('should limit results to 10 products', async () => {
      const manyHits = Array.from({ length: 20 }, (_, i) => ({
        product_id: `${i}`,
        name: `Product ${i}`,
        sku: `SKU-${i}`,
        price: 1000 + i * 100,
        is_in_stock: true,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: manyHits } }),
      });

      const result = await searchProductsTool.handler({ query: 'product' }, ctx);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect((data.products as Array<unknown>).length).toBe(10);
    });
  });
});
