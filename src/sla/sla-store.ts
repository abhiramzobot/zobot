/**
 * SLA Store (Phase 2C)
 *
 * Redis + InMemory fallback for SLA records.
 */

import Redis from 'ioredis';
import { SLARecord, SLAStore } from './types';
import { logger } from '../observability/logger';

const SLA_PREFIX = 'resolvr:sla:';
const SLA_ACTIVE_SET = 'resolvr:sla:active';

// ───── Redis Implementation ─────────────────────────────────────

class RedisSLAStore implements SLAStore {
  constructor(private readonly redis: Redis) {}

  async get(conversationId: string): Promise<SLARecord | null> {
    const raw = await this.redis.get(`${SLA_PREFIX}${conversationId}`);
    return raw ? (JSON.parse(raw) as SLARecord) : null;
  }

  async save(record: SLARecord): Promise<void> {
    await this.redis.setex(`${SLA_PREFIX}${record.conversationId}`, 7 * 86400, JSON.stringify(record));
    if (record.status !== 'breached' && !record.resolvedAt) {
      await this.redis.sadd(SLA_ACTIVE_SET, record.conversationId);
    } else {
      await this.redis.srem(SLA_ACTIVE_SET, record.conversationId);
    }
  }

  async getActive(): Promise<SLARecord[]> {
    const ids = await this.redis.smembers(SLA_ACTIVE_SET);
    const records: SLARecord[] = [];
    for (const id of ids) {
      const r = await this.get(id);
      if (r && !r.resolvedAt) records.push(r);
    }
    return records;
  }

  async getBreached(since: number): Promise<SLARecord[]> {
    const active = await this.getActive();
    return active.filter((r) => r.status === 'breached' && r.startedAt >= since);
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

class InMemorySLAStore implements SLAStore {
  private readonly store = new Map<string, SLARecord>();

  async get(conversationId: string): Promise<SLARecord | null> {
    return this.store.get(conversationId) ?? null;
  }

  async save(record: SLARecord): Promise<void> {
    this.store.set(record.conversationId, record);
  }

  async getActive(): Promise<SLARecord[]> {
    return Array.from(this.store.values()).filter((r) => !r.resolvedAt);
  }

  async getBreached(since: number): Promise<SLARecord[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.status === 'breached' && r.startedAt >= since,
    );
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createSLAStore(redis?: Redis): SLAStore {
  if (redis) {
    logger.info('SLA store: Redis-backed');
    return new RedisSLAStore(redis);
  }
  logger.info('SLA store: In-memory');
  return new InMemorySLAStore();
}
