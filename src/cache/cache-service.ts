/**
 * Cache Service (Phase 0A)
 *
 * Redis-backed with in-memory fallback.
 * Tracks hit/miss metrics via Prometheus.
 */

import Redis from 'ioredis';
import { CacheStore, CacheConfig } from './types';
import { logger } from '../observability/logger';

const DEFAULT_CONFIG: CacheConfig = {
  defaultTtlSeconds: 300,
  maxEntries: 10_000,
  keyPrefix: 'resolvr:cache:',
  excludePII: true,
};

// ───── Redis Implementation ─────────────────────────────────────

class RedisCacheStore implements CacheStore {
  private _hits = 0;
  private _misses = 0;
  private readonly log = logger.child({ component: 'cache-redis' });

  constructor(
    private readonly redis: Redis,
    private readonly config: CacheConfig,
  ) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.prefixKey(key));
      if (!raw) {
        this._misses++;
        return null;
      }
      this._hits++;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.log.warn({ err, key }, 'Cache get error');
      this._misses++;
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number, _containsPII?: boolean): Promise<void> {
    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    try {
      await this.redis.setex(this.prefixKey(key), ttl, JSON.stringify(value));
    } catch (err) {
      this.log.warn({ err, key }, 'Cache set error');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.prefixKey(key));
    } catch (err) {
      this.log.warn({ err, key }, 'Cache del error');
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return (await this.redis.exists(this.prefixKey(key))) === 1;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    // Only clears keys with our prefix (safe)
    const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  stats() {
    return { hits: this._hits, misses: this._misses, size: -1 };
  }

  private prefixKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, MemoryEntry>();
  private _hits = 0;
  private _misses = 0;

  constructor(private readonly config: CacheConfig) {
    // Periodic cleanup every 60s
    setInterval(() => this.evict(), 60_000).unref();
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    // Evict if at capacity
    if (this.store.size >= this.config.maxEntries) {
      this.evict();
      // If still at capacity, remove oldest
      if (this.store.size >= this.config.maxEntries) {
        const firstKey = this.store.keys().next().value;
        if (firstKey) this.store.delete(firstKey);
      }
    }
    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return false;
    return true;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  stats() {
    return { hits: this._hits, misses: this._misses, size: this.store.size };
  }

  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createCacheStore(redis?: Redis, config?: Partial<CacheConfig>): CacheStore {
  const merged = { ...DEFAULT_CONFIG, ...config };
  if (redis) {
    logger.info('Cache store: Redis-backed');
    return new RedisCacheStore(redis, merged);
  }
  logger.info('Cache store: In-memory');
  return new InMemoryCacheStore(merged);
}
