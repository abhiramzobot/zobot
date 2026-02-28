import { indexOrdersByNumber, getOrderByNumber } from '../../src/cache/order-index';
import { CacheStore } from '../../src/cache/types';

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

function createMockCacheStore(): jest.Mocked<CacheStore> {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null) as any,
    set: jest.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    has: jest.fn(async (key: string) => store.has(key)),
    clear: jest.fn(async () => { store.clear(); }),
    stats: jest.fn(() => ({ hits: 0, misses: 0, size: store.size })),
  };
}

describe('Order Number Index', () => {
  let cache: jest.Mocked<CacheStore>;

  beforeEach(() => {
    cache = createMockCacheStore();
  });

  describe('indexOrdersByNumber', () => {
    it('should index orders by their order number', async () => {
      const orders = [
        { orderNo: 'Q2593VU', status: 'Delivered', totalAmount: 5500 },
        { orderNo: 'Q1234AB', status: 'Shipped', totalAmount: 3200 },
      ];

      await indexOrdersByNumber(cache, orders, '98****10');

      expect(cache.set).toHaveBeenCalledTimes(2);
      expect(cache.set).toHaveBeenCalledWith(
        'order:no:Q2593VU',
        expect.objectContaining({
          orderNo: 'Q2593VU',
          status: 'Delivered',
          _sourcePhone: '98****10',
          _cachedAt: expect.any(Number),
        }),
        180,
      );
      expect(cache.set).toHaveBeenCalledWith(
        'order:no:Q1234AB',
        expect.objectContaining({ orderNo: 'Q1234AB' }),
        180,
      );
    });

    it('should normalize order numbers to uppercase', async () => {
      const orders = [{ orderNo: 'q2593vu', status: 'Delivered' }];
      await indexOrdersByNumber(cache, orders, '98****10');

      expect(cache.set).toHaveBeenCalledWith(
        'order:no:Q2593VU',
        expect.objectContaining({ orderNo: 'q2593vu' }),
        180,
      );
    });

    it('should skip orders without order numbers', async () => {
      const orders = [
        { orderNo: '', status: 'Delivered' },
        { status: 'Shipped' },
        { orderNo: 'Q1111AA', status: 'Confirmed' },
      ];

      await indexOrdersByNumber(cache, orders as any, '98****10');

      expect(cache.set).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith(
        'order:no:Q1111AA',
        expect.objectContaining({ orderNo: 'Q1111AA' }),
        180,
      );
    });

    it('should use custom TTL when provided', async () => {
      const orders = [{ orderNo: 'Q9999ZZ', status: 'Delivered' }];
      await indexOrdersByNumber(cache, orders, '98****10', 600);

      expect(cache.set).toHaveBeenCalledWith(
        'order:no:Q9999ZZ',
        expect.anything(),
        600,
      );
    });

    it('should not throw when cache.set fails', async () => {
      cache.set.mockRejectedValueOnce(new Error('Redis connection lost'));
      const orders = [{ orderNo: 'Q1111AA', status: 'Delivered' }];

      await expect(
        indexOrdersByNumber(cache, orders, '98****10'),
      ).resolves.not.toThrow();
    });

    it('should handle empty order array', async () => {
      await indexOrdersByNumber(cache, [], '98****10');
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('getOrderByNumber', () => {
    it('should retrieve a cached order by number', async () => {
      const order = { orderNo: 'Q2593VU', status: 'Delivered', _sourcePhone: '98****10' };
      await cache.set('order:no:Q2593VU', order);

      const result = await getOrderByNumber(cache, 'Q2593VU');
      expect(result).toEqual(order);
    });

    it('should normalize lookup key to uppercase', async () => {
      const order = { orderNo: 'Q2593VU', status: 'Delivered' };
      await cache.set('order:no:Q2593VU', order);

      const result = await getOrderByNumber(cache, 'q2593vu');
      expect(cache.get).toHaveBeenCalledWith('order:no:Q2593VU');
      expect(result).toEqual(order);
    });

    it('should return null when order not found', async () => {
      const result = await getOrderByNumber(cache, 'NONEXIST');
      expect(result).toBeNull();
    });

    it('should trim whitespace from order number', async () => {
      await getOrderByNumber(cache, '  Q2593VU  ');
      expect(cache.get).toHaveBeenCalledWith('order:no:Q2593VU');
    });
  });
});
