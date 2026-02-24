/**
 * Cache Infrastructure Types (Phase 0A)
 *
 * Generic cache layer with Redis + InMemory fallback.
 * Used by: Tool Caching, Graceful Degradation, Customer 360
 */

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  /** Whether this entry contains PII (excluded from logging) */
  containsPII: boolean;
}

export interface CacheConfig {
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  /** Maximum entries in memory cache */
  maxEntries: number;
  /** Redis key prefix */
  keyPrefix: string;
  /** Whether to exclude PII from caching */
  excludePII: boolean;
}

export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number, containsPII?: boolean): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  /** Get cache statistics */
  stats(): { hits: number; misses: number; size: number };
}
