/**
 * Order Number Index (Performance Optimization)
 *
 * After a phone-based order lookup, indexes each order by its
 * customer-facing order number in Redis for O(1) direct lookups.
 * Eliminates the need for a phone number when looking up a specific order.
 */

import { CacheStore } from './types';
import { logger } from '../observability/logger';

const ORDER_INDEX_PREFIX = 'order:no:';
const DEFAULT_TTL = 180; // 3 minutes (matches lookup_customer_orders cache TTL)

/**
 * After a successful phone-based order lookup, index each order by its
 * customer-facing order number in Redis for direct O(1) lookups.
 */
export async function indexOrdersByNumber(
  cache: CacheStore,
  orders: Array<Record<string, unknown>>,
  sourcePhone: string,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<void> {
  const log = logger.child({ component: 'order-index' });

  for (const order of orders) {
    const orderNo = String(order.orderNo ?? '').toUpperCase().trim();
    if (!orderNo) continue;

    const key = `${ORDER_INDEX_PREFIX}${orderNo}`;
    const entry = {
      ...order,
      _cachedAt: Date.now(),
      _sourcePhone: sourcePhone,
    };

    try {
      await cache.set(key, entry, ttlSeconds);
    } catch (err) {
      log.warn({ err, orderNo }, 'Failed to index order by number');
    }
  }

  if (orders.length > 0) {
    log.info({ count: orders.length }, 'Orders indexed by number');
  }
}

/**
 * Look up a single order by its customer-facing order number.
 * Returns the cached order data if available, null if not in cache.
 */
export async function getOrderByNumber(
  cache: CacheStore,
  orderNo: string,
): Promise<Record<string, unknown> | null> {
  const key = `${ORDER_INDEX_PREFIX}${orderNo.toUpperCase().trim()}`;
  return cache.get<Record<string, unknown>>(key);
}
