/**
 * Audit Service Singleton (Phase 0B)
 *
 * High-level API for audit logging with automatic chain hashing.
 */

import { v4 as uuid } from 'uuid';
import { AuditCategory, AuditEvent, AuditFilter, AuditStore } from './types';
import { computeHash } from './audit-store';
import { logger } from '../observability/logger';

export class AuditService {
  private lastHash = 'genesis';
  private readonly log = logger.child({ component: 'audit-service' });

  constructor(private readonly store: AuditStore) {}

  async init(): Promise<void> {
    this.lastHash = await this.store.getLastHash();
  }

  async logEvent(
    actor: string,
    action: string,
    category: AuditCategory,
    details: Record<string, unknown> = {},
    conversationId?: string,
    tenantId?: string,
  ): Promise<AuditEvent> {
    const partial = {
      eventId: uuid(),
      timestamp: Date.now(),
      actor,
      action,
      category,
      conversationId,
      tenantId,
      details,
      previousHash: this.lastHash,
    };

    const dataHash = computeHash(partial, this.lastHash);

    const event: AuditEvent = {
      ...partial,
      dataHash,
    };

    await this.store.append(event);
    this.lastHash = dataHash;

    this.log.debug({ eventId: event.eventId, category, action }, 'Audit event logged');
    return event;
  }

  async getAuditTrail(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.store.query(filter);
  }

  async verifyIntegrity(conversationId?: string): Promise<{ valid: boolean; brokenAt?: string }> {
    return this.store.verifyIntegrity(conversationId);
  }
}

/** Singleton — initialized in app.ts */
let _auditService: AuditService | undefined;

export function initAuditService(store: AuditStore): AuditService {
  _auditService = new AuditService(store);
  return _auditService;
}

export function getAuditService(): AuditService | undefined {
  return _auditService;
}
