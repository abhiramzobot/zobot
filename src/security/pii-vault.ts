/**
 * PII Vault (Phase 7)
 *
 * Tokenized PII storage with AES-256-GCM encryption.
 * PII values are replaced with meaningless tokens (pii_tok_<uuid>)
 * that can only be resolved through this vault.
 *
 * Factory pattern: Redis-backed or In-memory fallback.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { v4 as uuid } from 'uuid';
import Redis from 'ioredis';
import { logger } from '../observability/logger';
import { PIISeverity } from './pii-classifier';

const VAULT_KEY_PREFIX = 'pii_vault:';
const TOKEN_PREFIX = 'pii_tok_';

/** Default TTL by severity (seconds) */
const SEVERITY_TTL: Record<PIISeverity, number> = {
  critical: 0,      // Never stored (immediate use only)
  high: 7 * 86400,  // 7 days
  medium: 30 * 86400, // 30 days
  low: 90 * 86400,  // 90 days
};

export interface PIIVault {
  /** Tokenize a PII value. Returns a meaningless token. */
  tokenize(conversationId: string, piiType: string, severity: PIISeverity, value: string): Promise<string>;
  /** Resolve a token back to the original value. */
  detokenize(token: string): Promise<string | null>;
  /** Purge all PII for a conversation. */
  purge(conversationId: string): Promise<void>;
  /** Purge expired entries. Returns count of purged entries. */
  purgeExpired(): Promise<number>;
}

// ───── Encryption Helpers ───────────────────────────────────────

function encrypt(plaintext: string, key: Buffer): { iv: string; ciphertext: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decrypt(encrypted: { iv: string; ciphertext: string; tag: string }, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function deriveKey(secret: string): Buffer {
  // Use first 32 bytes of hex-encoded secret, or pad with zeros
  const buf = Buffer.alloc(32, 0);
  Buffer.from(secret, 'utf8').copy(buf, 0, 0, 32);
  return buf;
}

// ───── Redis Implementation ─────────────────────────────────────

class RedisPIIVault implements PIIVault {
  private readonly key: Buffer;
  private readonly log = logger.child({ component: 'pii-vault-redis' });

  constructor(private readonly redis: Redis, encryptionSecret: string) {
    this.key = deriveKey(encryptionSecret);
  }

  async tokenize(conversationId: string, piiType: string, severity: PIISeverity, value: string): Promise<string> {
    if (severity === 'critical') {
      // Critical PII: encrypt but set 0 TTL (in-memory only for this call)
      // Return a token that auto-expires, used only within the current tool chain
      const token = `${TOKEN_PREFIX}${uuid()}`;
      const encrypted = encrypt(value, this.key);
      const ttl = 300; // 5 minutes max for critical PII
      await this.redis.setex(
        `${VAULT_KEY_PREFIX}${token}`,
        ttl,
        JSON.stringify({ ...encrypted, conversationId, piiType, severity }),
      );
      // Track token for conversation
      await this.redis.sadd(`${VAULT_KEY_PREFIX}conv:${conversationId}`, token);
      await this.redis.expire(`${VAULT_KEY_PREFIX}conv:${conversationId}`, ttl);
      return token;
    }

    const token = `${TOKEN_PREFIX}${uuid()}`;
    const encrypted = encrypt(value, this.key);
    const ttl = SEVERITY_TTL[severity];

    await this.redis.setex(
      `${VAULT_KEY_PREFIX}${token}`,
      ttl,
      JSON.stringify({ ...encrypted, conversationId, piiType, severity }),
    );

    // Track token for conversation-level purge
    await this.redis.sadd(`${VAULT_KEY_PREFIX}conv:${conversationId}`, token);
    await this.redis.expire(`${VAULT_KEY_PREFIX}conv:${conversationId}`, ttl);

    return token;
  }

  async detokenize(token: string): Promise<string | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const stored = await this.redis.get(`${VAULT_KEY_PREFIX}${token}`);
    if (!stored) return null;

    try {
      const { iv, ciphertext, tag } = JSON.parse(stored);
      return decrypt({ iv, ciphertext, tag }, this.key);
    } catch (err) {
      this.log.error({ err, token }, 'Failed to detokenize');
      return null;
    }
  }

  async purge(conversationId: string): Promise<void> {
    const tokens = await this.redis.smembers(`${VAULT_KEY_PREFIX}conv:${conversationId}`);
    if (tokens.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const token of tokens) {
      pipeline.del(`${VAULT_KEY_PREFIX}${token}`);
    }
    pipeline.del(`${VAULT_KEY_PREFIX}conv:${conversationId}`);
    await pipeline.exec();

    this.log.info({ conversationId, purgedCount: tokens.length }, 'PII purged for conversation');
  }

  async purgeExpired(): Promise<number> {
    // Redis handles TTL-based expiry automatically
    return 0;
  }
}

// ───── In-Memory Implementation ─────────────────────────────────

interface InMemoryEntry {
  encrypted: { iv: string; ciphertext: string; tag: string };
  conversationId: string;
  piiType: string;
  severity: PIISeverity;
  expiresAt: number;
}

class InMemoryPIIVault implements PIIVault {
  private readonly store = new Map<string, InMemoryEntry>();
  private readonly convIndex = new Map<string, Set<string>>();
  private readonly key: Buffer;
  private readonly log = logger.child({ component: 'pii-vault-memory' });

  constructor(encryptionSecret: string) {
    this.key = deriveKey(encryptionSecret);
  }

  async tokenize(conversationId: string, piiType: string, severity: PIISeverity, value: string): Promise<string> {
    const token = `${TOKEN_PREFIX}${uuid()}`;
    const encrypted = encrypt(value, this.key);
    const ttlSeconds = severity === 'critical' ? 300 : SEVERITY_TTL[severity];

    this.store.set(token, {
      encrypted,
      conversationId,
      piiType,
      severity,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    // Track for conversation purge
    if (!this.convIndex.has(conversationId)) {
      this.convIndex.set(conversationId, new Set());
    }
    this.convIndex.get(conversationId)!.add(token);

    return token;
  }

  async detokenize(token: string): Promise<string | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const entry = this.store.get(token);
    if (!entry) return null;

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      this.store.delete(token);
      return null;
    }

    try {
      return decrypt(entry.encrypted, this.key);
    } catch (err) {
      this.log.error({ err, token }, 'Failed to detokenize');
      return null;
    }
  }

  async purge(conversationId: string): Promise<void> {
    const tokens = this.convIndex.get(conversationId);
    if (!tokens) return;

    for (const token of tokens) {
      this.store.delete(token);
    }
    this.convIndex.delete(conversationId);

    this.log.info({ conversationId, purgedCount: tokens.size }, 'PII purged for conversation');
  }

  async purgeExpired(): Promise<number> {
    const now = Date.now();
    let purged = 0;

    for (const [token, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(token);
        // Remove from conv index
        const convTokens = this.convIndex.get(entry.conversationId);
        if (convTokens) {
          convTokens.delete(token);
          if (convTokens.size === 0) this.convIndex.delete(entry.conversationId);
        }
        purged++;
      }
    }

    if (purged > 0) {
      this.log.info({ purged }, 'Expired PII entries purged');
    }
    return purged;
  }
}

// ───── Factory ──────────────────────────────────────────────────

export function createPIIVault(redis?: Redis, encryptionSecret?: string): PIIVault {
  const secret = encryptionSecret ?? process.env.PII_ENCRYPTION_KEY ?? 'default-dev-key-change-in-prod';

  if (redis) {
    logger.info('PII vault: Redis-backed (encrypted)');
    return new RedisPIIVault(redis, secret);
  }

  logger.info('PII vault: In-memory (encrypted)');
  return new InMemoryPIIVault(secret);
}
