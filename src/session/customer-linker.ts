/**
 * Customer Linker (Phase 2D)
 *
 * Links sessions across channels by phone/email.
 */

import Redis from 'ioredis';
import { logger } from '../observability/logger';

const LINK_PREFIX = 'resolvr:customer_sessions:';
const MAX_LINKED_SESSIONS = 20;

export interface CustomerLink {
  customerId: string;
  conversationIds: string[];
  phone?: string;
  email?: string;
}

export interface CustomerLinker {
  /** Link a conversation to a customer identity */
  link(conversationId: string, phone?: string, email?: string): Promise<string | null>;
  /** Get all conversations for a customer */
  getLinkedConversations(customerId: string): Promise<string[]>;
  /** Find customer ID by phone or email */
  findCustomer(phone?: string, email?: string): Promise<string | null>;
}

// ───── Redis Implementation ─────────────────────────────────────

class RedisCustomerLinker implements CustomerLinker {
  constructor(private readonly redis: Redis) {}

  async link(conversationId: string, phone?: string, email?: string): Promise<string | null> {
    if (!phone && !email) return null;

    const customerId = this.deriveCustomerId(phone, email);
    const key = `${LINK_PREFIX}${customerId}`;

    // Add to sorted set (score = timestamp for ordering)
    await this.redis.zadd(key, Date.now(), conversationId);

    // Keep only last N sessions
    const count = await this.redis.zcard(key);
    if (count > MAX_LINKED_SESSIONS) {
      await this.redis.zremrangebyrank(key, 0, count - MAX_LINKED_SESSIONS - 1);
    }

    // Set index by phone/email
    if (phone) await this.redis.set(`${LINK_PREFIX}phone:${phone}`, customerId, 'EX', 90 * 86400);
    if (email) await this.redis.set(`${LINK_PREFIX}email:${email}`, customerId, 'EX', 90 * 86400);

    // TTL 90 days
    await this.redis.expire(key, 90 * 86400);

    return customerId;
  }

  async getLinkedConversations(customerId: string): Promise<string[]> {
    return this.redis.zrevrange(`${LINK_PREFIX}${customerId}`, 0, MAX_LINKED_SESSIONS);
  }

  async findCustomer(phone?: string, email?: string): Promise<string | null> {
    if (phone) {
      const id = await this.redis.get(`${LINK_PREFIX}phone:${phone}`);
      if (id) return id;
    }
    if (email) {
      const id = await this.redis.get(`${LINK_PREFIX}email:${email}`);
      if (id) return id;
    }
    return null;
  }

  private deriveCustomerId(phone?: string, email?: string): string {
    return `cust_${phone ?? email ?? 'unknown'}`;
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

class InMemoryCustomerLinker implements CustomerLinker {
  private readonly sessions = new Map<string, string[]>();
  private readonly phoneIndex = new Map<string, string>();
  private readonly emailIndex = new Map<string, string>();

  async link(conversationId: string, phone?: string, email?: string): Promise<string | null> {
    if (!phone && !email) return null;

    const customerId = `cust_${phone ?? email ?? 'unknown'}`;

    if (!this.sessions.has(customerId)) {
      this.sessions.set(customerId, []);
    }
    const list = this.sessions.get(customerId)!;
    if (!list.includes(conversationId)) {
      list.push(conversationId);
      if (list.length > MAX_LINKED_SESSIONS) list.shift();
    }

    if (phone) this.phoneIndex.set(phone, customerId);
    if (email) this.emailIndex.set(email, customerId);

    return customerId;
  }

  async getLinkedConversations(customerId: string): Promise<string[]> {
    return [...(this.sessions.get(customerId) ?? [])].reverse();
  }

  async findCustomer(phone?: string, email?: string): Promise<string | null> {
    if (phone && this.phoneIndex.has(phone)) return this.phoneIndex.get(phone)!;
    if (email && this.emailIndex.has(email)) return this.emailIndex.get(email)!;
    return null;
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createCustomerLinker(redis?: Redis): CustomerLinker {
  if (redis) {
    logger.info('Customer linker: Redis-backed');
    return new RedisCustomerLinker(redis);
  }
  logger.info('Customer linker: In-memory');
  return new InMemoryCustomerLinker();
}
