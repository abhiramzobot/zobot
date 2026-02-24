/**
 * Audit Store (Phase 0B)
 *
 * Append-only store with SHA-256 chain hashing.
 * Redis-backed with in-memory fallback.
 */

import { createHash } from 'crypto';
import Redis from 'ioredis';
import { AuditEvent, AuditFilter, AuditStore } from './types';
import { logger } from '../observability/logger';

const AUDIT_PREFIX = 'resolvr:audit:';
const CHAIN_KEY = 'resolvr:audit:chain_head';

function computeHash(event: Omit<AuditEvent, 'dataHash'>, previousHash: string): string {
  const payload = JSON.stringify({
    eventId: event.eventId,
    timestamp: event.timestamp,
    actor: event.actor,
    action: event.action,
    category: event.category,
    details: event.details,
    previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

// ───── Redis Implementation ─────────────────────────────────────

class RedisAuditStore implements AuditStore {
  private readonly log = logger.child({ component: 'audit-store-redis' });

  constructor(private readonly redis: Redis) {}

  async append(event: AuditEvent): Promise<void> {
    try {
      const key = `${AUDIT_PREFIX}events`;
      await this.redis.rpush(key, JSON.stringify(event));

      // Index by conversation if present
      if (event.conversationId) {
        await this.redis.rpush(`${AUDIT_PREFIX}conv:${event.conversationId}`, JSON.stringify(event));
      }

      // Update chain head
      await this.redis.set(CHAIN_KEY, event.dataHash);
    } catch (err) {
      this.log.error({ err }, 'Audit append failed');
    }
  }

  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    try {
      let key = `${AUDIT_PREFIX}events`;
      if (filter.conversationId) {
        key = `${AUDIT_PREFIX}conv:${filter.conversationId}`;
      }

      const raw = await this.redis.lrange(key, 0, -1);
      let events = raw.map((r) => JSON.parse(r) as AuditEvent);

      if (filter.category) events = events.filter((e) => e.category === filter.category);
      if (filter.actor) events = events.filter((e) => e.actor === filter.actor);
      if (filter.tenantId) events = events.filter((e) => e.tenantId === filter.tenantId);
      if (filter.since) events = events.filter((e) => e.timestamp >= filter.since!);
      if (filter.until) events = events.filter((e) => e.timestamp <= filter.until!);
      if (filter.limit) events = events.slice(-filter.limit);

      return events;
    } catch (err) {
      this.log.error({ err }, 'Audit query failed');
      return [];
    }
  }

  async getLastHash(): Promise<string> {
    return (await this.redis.get(CHAIN_KEY)) ?? 'genesis';
  }

  async verifyIntegrity(conversationId?: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const events = await this.query({ conversationId });
    return verifyChain(events);
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];
  private readonly convIndex = new Map<string, AuditEvent[]>();
  private lastHash = 'genesis';

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
    this.lastHash = event.dataHash;

    if (event.conversationId) {
      if (!this.convIndex.has(event.conversationId)) {
        this.convIndex.set(event.conversationId, []);
      }
      this.convIndex.get(event.conversationId)!.push(event);
    }
  }

  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    let events = filter.conversationId
      ? (this.convIndex.get(filter.conversationId) ?? [])
      : [...this.events];

    if (filter.category) events = events.filter((e) => e.category === filter.category);
    if (filter.actor) events = events.filter((e) => e.actor === filter.actor);
    if (filter.tenantId) events = events.filter((e) => e.tenantId === filter.tenantId);
    if (filter.since) events = events.filter((e) => e.timestamp >= filter.since!);
    if (filter.until) events = events.filter((e) => e.timestamp <= filter.until!);
    if (filter.limit) events = events.slice(-filter.limit);

    return events;
  }

  async getLastHash(): Promise<string> {
    return this.lastHash;
  }

  async verifyIntegrity(conversationId?: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const events = await this.query({ conversationId });
    return verifyChain(events);
  }
}

// ───── Chain Verification ───────────────────────────────────────

function verifyChain(events: AuditEvent[]): { valid: boolean; brokenAt?: string } {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expectedPrevious = i === 0 ? 'genesis' : events[i - 1].dataHash;
    const recomputed = computeHash(event, expectedPrevious);

    if (recomputed !== event.dataHash) {
      return { valid: false, brokenAt: event.eventId };
    }
  }
  return { valid: true };
}

// ───── Factory ──────────────────────────────────────────────────

export function createAuditStore(redis?: Redis): AuditStore {
  if (redis) {
    logger.info('Audit store: Redis-backed (append-only, SHA-256 chain)');
    return new RedisAuditStore(redis);
  }
  logger.info('Audit store: In-memory (append-only, SHA-256 chain)');
  return new InMemoryAuditStore();
}

export { computeHash };
