import Redis from 'ioredis';
import { ChatSessionStore, ChatSessionSummary, CSATSubmission } from './types';
import { env } from '../config/env';
import { logger } from '../observability/logger';

const SESSION_TTL = () => env.chat.sessionTtlDays * 24 * 60 * 60; // default 90 days

/**
 * Redis-backed session store.
 * Uses sorted sets for visitor→sessions index and hashes for session summaries.
 */
export class RedisSessionStore implements ChatSessionStore {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.prefix = env.redis.keyPrefix;
  }

  private visitorKey(visitorId: string): string {
    return `${this.prefix}visitor:${visitorId}:sessions`;
  }

  private sessionKey(conversationId: string): string {
    return `${this.prefix}session:${conversationId}`;
  }

  private csatKey(conversationId: string): string {
    return `${this.prefix}csat:${conversationId}`;
  }

  async indexSession(summary: ChatSessionSummary): Promise<void> {
    try {
      const ttl = SESSION_TTL();
      const pipe = this.redis.pipeline();

      // Store session summary
      pipe.set(this.sessionKey(summary.conversationId), JSON.stringify(summary), 'EX', ttl);

      // Add to visitor's sorted set (score = createdAt for chronological ordering)
      pipe.zadd(this.visitorKey(summary.visitorId), summary.createdAt, summary.conversationId);
      pipe.expire(this.visitorKey(summary.visitorId), ttl);

      await pipe.exec();
    } catch (err) {
      logger.error({ err, conversationId: summary.conversationId }, 'Failed to index session in Redis');
    }
  }

  async getSessionsByVisitor(visitorId: string, limit?: number): Promise<ChatSessionSummary[]> {
    try {
      const max = limit ?? env.chat.maxHistoryPerVisitor;
      // Get conversation IDs sorted by recency (newest first)
      const ids = await this.redis.zrevrange(this.visitorKey(visitorId), 0, max - 1);
      if (!ids.length) return [];

      // Fetch all summaries in parallel
      const pipe = this.redis.pipeline();
      for (const id of ids) {
        pipe.get(this.sessionKey(id));
      }
      const results = await pipe.exec();

      const summaries: ChatSessionSummary[] = [];
      if (results) {
        for (const [err, raw] of results) {
          if (!err && raw && typeof raw === 'string') {
            try {
              summaries.push(JSON.parse(raw) as ChatSessionSummary);
            } catch {
              // skip malformed entries
            }
          }
        }
      }
      return summaries;
    } catch (err) {
      logger.error({ err, visitorId }, 'Failed to get sessions from Redis');
      return [];
    }
  }

  async getSessionSummary(conversationId: string): Promise<ChatSessionSummary | null> {
    try {
      const raw = await this.redis.get(this.sessionKey(conversationId));
      if (!raw) return null;
      return JSON.parse(raw) as ChatSessionSummary;
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to get session summary from Redis');
      return null;
    }
  }

  async saveCSAT(csat: CSATSubmission): Promise<void> {
    try {
      await this.redis.set(
        this.csatKey(csat.conversationId),
        JSON.stringify(csat),
        'EX',
        SESSION_TTL(),
      );
    } catch (err) {
      logger.error({ err, conversationId: csat.conversationId }, 'Failed to save CSAT in Redis');
    }
  }

  async getCSAT(conversationId: string): Promise<CSATSubmission | null> {
    try {
      const raw = await this.redis.get(this.csatKey(conversationId));
      if (!raw) return null;
      return JSON.parse(raw) as CSATSubmission;
    } catch (err) {
      logger.error({ err, conversationId }, 'Failed to get CSAT from Redis');
      return null;
    }
  }
}

/**
 * In-memory session store (dev/test fallback).
 */
export class InMemorySessionStore implements ChatSessionStore {
  private sessions = new Map<string, ChatSessionSummary>();
  private visitorIndex = new Map<string, Set<string>>();
  private csatData = new Map<string, CSATSubmission>();

  async indexSession(summary: ChatSessionSummary): Promise<void> {
    this.sessions.set(summary.conversationId, summary);

    if (!this.visitorIndex.has(summary.visitorId)) {
      this.visitorIndex.set(summary.visitorId, new Set());
    }
    this.visitorIndex.get(summary.visitorId)!.add(summary.conversationId);
  }

  async getSessionsByVisitor(visitorId: string, limit?: number): Promise<ChatSessionSummary[]> {
    const max = limit ?? env.chat.maxHistoryPerVisitor;
    const ids = this.visitorIndex.get(visitorId);
    if (!ids) return [];

    const summaries: ChatSessionSummary[] = [];
    for (const id of ids) {
      const s = this.sessions.get(id);
      if (s) summaries.push(s);
    }

    // Sort by createdAt descending (newest first)
    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries.slice(0, max);
  }

  async getSessionSummary(conversationId: string): Promise<ChatSessionSummary | null> {
    return this.sessions.get(conversationId) ?? null;
  }

  async saveCSAT(csat: CSATSubmission): Promise<void> {
    this.csatData.set(csat.conversationId, csat);
  }

  async getCSAT(conversationId: string): Promise<CSATSubmission | null> {
    return this.csatData.get(conversationId) ?? null;
  }
}

/**
 * Factory — create the appropriate session store based on environment.
 */
export function createSessionStore(redis?: Redis): ChatSessionStore {
  if (redis) {
    return new RedisSessionStore(redis);
  }
  logger.warn('Using in-memory session store (no Redis)');
  return new InMemorySessionStore();
}
