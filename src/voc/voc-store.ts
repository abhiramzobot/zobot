/**
 * VOC Record Store — Async storage for canonical VOC records.
 *
 * Factory pattern: uses Redis when available, falls back to in-memory.
 * VOC records are stored per-conversation for analytics and audit trail.
 */

import Redis from 'ioredis';
import { VOCRecord } from './types';
import { logger } from '../observability/logger';

const VOC_KEY_PREFIX = 'voc:';
const VOC_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days retention

export interface VOCStore {
  /** Save a VOC record (append to conversation's record list) */
  save(record: VOCRecord): Promise<void>;
  /** Get all VOC records for a conversation */
  getByConversation(conversationId: string): Promise<VOCRecord[]>;
  /** Get all stored VOC records (for analytics, with optional limit) */
  getAll(limit?: number): Promise<VOCRecord[]>;
  /** Delete VOC records for a conversation */
  deleteByConversation(conversationId: string): Promise<void>;
}

// ───── Redis Implementation ─────────────────────────────────────

class RedisVOCStore implements VOCStore {
  constructor(private readonly redis: Redis) {}

  async save(record: VOCRecord): Promise<void> {
    const key = `${VOC_KEY_PREFIX}${record.conversationId}`;
    try {
      await this.redis.rpush(key, JSON.stringify(record));
      await this.redis.expire(key, VOC_TTL_SECONDS);
    } catch (err) {
      logger.error({ err, conversationId: record.conversationId }, 'Failed to save VOC record to Redis');
    }
  }

  async getByConversation(conversationId: string): Promise<VOCRecord[]> {
    const key = `${VOC_KEY_PREFIX}${conversationId}`;
    try {
      const items = await this.redis.lrange(key, 0, -1);
      return items.map((item) => JSON.parse(item) as VOCRecord);
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to get VOC records from Redis');
      return [];
    }
  }

  async getAll(limit: number = 1000): Promise<VOCRecord[]> {
    try {
      const keys = await this.redis.keys(`${VOC_KEY_PREFIX}*`);
      const allRecords: VOCRecord[] = [];
      for (const key of keys.slice(0, 100)) { // Limit conversation scan
        const items = await this.redis.lrange(key, 0, -1);
        for (const item of items) {
          allRecords.push(JSON.parse(item) as VOCRecord);
          if (allRecords.length >= limit) return allRecords;
        }
      }
      return allRecords;
    } catch (err) {
      logger.error({ err }, 'Failed to get all VOC records from Redis');
      return [];
    }
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    const key = `${VOC_KEY_PREFIX}${conversationId}`;
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to delete VOC records from Redis');
    }
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

class InMemoryVOCStore implements VOCStore {
  private store: Map<string, VOCRecord[]> = new Map();

  async save(record: VOCRecord): Promise<void> {
    const existing = this.store.get(record.conversationId) ?? [];
    existing.push(record);
    this.store.set(record.conversationId, existing);
  }

  async getByConversation(conversationId: string): Promise<VOCRecord[]> {
    return this.store.get(conversationId) ?? [];
  }

  async getAll(limit: number = 1000): Promise<VOCRecord[]> {
    const allRecords: VOCRecord[] = [];
    for (const records of this.store.values()) {
      for (const record of records) {
        allRecords.push(record);
        if (allRecords.length >= limit) return allRecords;
      }
    }
    return allRecords;
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    this.store.delete(conversationId);
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createVOCStore(redis?: Redis): VOCStore {
  if (redis) {
    logger.info('VOC store: Redis-backed');
    return new RedisVOCStore(redis);
  }
  logger.info('VOC store: In-memory');
  return new InMemoryVOCStore();
}
