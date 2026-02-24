import Redis from 'ioredis';
import { ConversationRecord, ConversationStore } from './types';
import { StructuredMemory } from '../config/types';
import { env } from '../config/env';
import { logger } from '../observability/logger';

const CONVERSATION_TTL = 24 * 60 * 60; // 24 hours
const MAX_TURNS = 20;

/**
 * Redis-backed conversation store.
 */
export class RedisConversationStore implements ConversationStore {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.prefix = `${env.redis.keyPrefix}conv:`;
  }

  private key(conversationId: string): string {
    return `${this.prefix}${conversationId}`;
  }

  async get(conversationId: string): Promise<ConversationRecord | null> {
    try {
      const raw = await this.redis.get(this.key(conversationId));
      if (!raw) return null;
      return JSON.parse(raw) as ConversationRecord;
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to read conversation from Redis');
      return null;
    }
  }

  async save(record: ConversationRecord): Promise<void> {
    try {
      // Trim turns to MAX_TURNS (keep system + last N)
      if (record.turns.length > MAX_TURNS) {
        const systemTurns = record.turns.filter((t) => t.role === 'system');
        const nonSystem = record.turns.filter((t) => t.role !== 'system');
        record.turns = [...systemTurns, ...nonSystem.slice(-MAX_TURNS)];
      }
      record.updatedAt = Date.now();
      await this.redis.set(
        this.key(record.conversationId),
        JSON.stringify(record),
        'EX',
        CONVERSATION_TTL,
      );
    } catch (err) {
      logger.error({ err, conversationId: record.conversationId }, 'Failed to save conversation to Redis');
    }
  }

  async delete(conversationId: string): Promise<void> {
    await this.redis.del(this.key(conversationId));
  }
}

/**
 * In-memory conversation store (dev/test fallback).
 */
export class InMemoryConversationStore implements ConversationStore {
  private store: Map<string, ConversationRecord> = new Map();

  async get(conversationId: string): Promise<ConversationRecord | null> {
    return this.store.get(conversationId) ?? null;
  }

  async save(record: ConversationRecord): Promise<void> {
    if (record.turns.length > MAX_TURNS) {
      const systemTurns = record.turns.filter((t) => t.role === 'system');
      const nonSystem = record.turns.filter((t) => t.role !== 'system');
      record.turns = [...systemTurns, ...nonSystem.slice(-MAX_TURNS)];
    }
    record.updatedAt = Date.now();
    this.store.set(record.conversationId, record);
  }

  async delete(conversationId: string): Promise<void> {
    this.store.delete(conversationId);
  }
}

/**
 * Create the appropriate store based on environment.
 */
export function createConversationStore(redis?: Redis): ConversationStore {
  if (redis) {
    return new RedisConversationStore(redis);
  }
  logger.warn('Using in-memory conversation store (no Redis)');
  return new InMemoryConversationStore();
}

/**
 * Merge new extracted fields into structured memory.
 */
export function mergeStructuredMemory(
  existing: StructuredMemory,
  extracted: Record<string, unknown>,
): StructuredMemory {
  const merged = { ...existing };
  if (extracted.name && typeof extracted.name === 'string') merged.name = extracted.name;
  if (extracted.email && typeof extracted.email === 'string') merged.email = extracted.email;
  if (extracted.phone && typeof extracted.phone === 'string') merged.phone = extracted.phone;
  if (extracted.company && typeof extracted.company === 'string') merged.company = extracted.company;
  if (extracted.intent && typeof extracted.intent === 'string') merged.intent = extracted.intent;
  if (Array.isArray(extracted.productInterest)) {
    merged.productInterest = [
      ...new Set([...(merged.productInterest ?? []), ...extracted.productInterest.map(String)]),
    ];
  }
  // Merge any other fields into customFields
  for (const [k, v] of Object.entries(extracted)) {
    if (!['name', 'email', 'phone', 'company', 'intent', 'productInterest'].includes(k)) {
      merged.customFields[k] = v;
    }
  }
  return merged;
}
