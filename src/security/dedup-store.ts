/**
 * Webhook Deduplication Store (Phase 1A)
 *
 * Redis SET NX with 1hr TTL for message dedup.
 * In-memory fallback with LRU eviction.
 */

import Redis from 'ioredis';
import { logger } from '../observability/logger';

const DEDUP_PREFIX = 'resolvr:dedup:';
const DEFAULT_TTL_SECONDS = 3600; // 1 hour

export interface DedupStore {
  /** Returns true if this is a NEW (non-duplicate) message */
  isNew(messageId: string): Promise<boolean>;
}

// ───── Redis Implementation ─────────────────────────────────────

class RedisDedupStore implements DedupStore {
  constructor(private readonly redis: Redis) {}

  async isNew(messageId: string): Promise<boolean> {
    try {
      // SET NX returns 'OK' if key was set (new), null if exists (duplicate)
      const result = await this.redis.set(
        `${DEDUP_PREFIX}${messageId}`,
        '1',
        'EX',
        DEFAULT_TTL_SECONDS,
        'NX',
      );
      return result === 'OK';
    } catch (err) {
      logger.warn({ err }, 'Dedup check failed; allowing message');
      return true; // Fail open
    }
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

class InMemoryDedupStore implements DedupStore {
  private readonly seen = new Map<string, number>();
  private readonly maxSize = 50_000;

  constructor() {
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  async isNew(messageId: string): Promise<boolean> {
    const existing = this.seen.get(messageId);
    const now = Date.now();

    if (existing && now - existing < DEFAULT_TTL_SECONDS * 1000) {
      return false; // Duplicate
    }

    // Evict oldest if at capacity
    if (this.seen.size >= this.maxSize) {
      const firstKey = this.seen.keys().next().value;
      if (firstKey) this.seen.delete(firstKey);
    }

    this.seen.set(messageId, now);
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const ttlMs = DEFAULT_TTL_SECONDS * 1000;
    for (const [key, ts] of this.seen) {
      if (now - ts > ttlMs) this.seen.delete(key);
    }
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createDedupStore(redis?: Redis): DedupStore {
  if (redis) {
    logger.info('Dedup store: Redis-backed (SET NX, 1hr TTL)');
    return new RedisDedupStore(redis);
  }
  logger.info('Dedup store: In-memory');
  return new InMemoryDedupStore();
}
