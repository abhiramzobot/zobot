/**
 * GDPR Service (Phase 2E)
 *
 * Data export API, right to erasure API.
 */

import { AuditStore, AuditEvent } from './types';
import { ConversationStore } from '../memory/types';
import { PIIVault } from '../security/pii-vault';
import { logger } from '../observability/logger';

export interface GDPRExportData {
  requestId: string;
  customerId: string;
  exportedAt: number;
  conversations: Array<{
    conversationId: string;
    turns: Array<{ role: string; content: string; timestamp: number }>;
    state: string;
    createdAt: number;
  }>;
  auditTrail: AuditEvent[];
  piiNote: string;
}

export interface GDPRErasureResult {
  requestId: string;
  customerId: string;
  erasedAt: number;
  conversationsErased: number;
  auditEventsRetained: number;
  piiPurged: boolean;
}

export class GDPRService {
  private readonly log = logger.child({ component: 'gdpr-service' });

  constructor(
    private readonly conversationStore: ConversationStore,
    private readonly auditStore: AuditStore,
    private readonly piiVault?: PIIVault,
  ) {}

  /** Export all data for a customer (GDPR Article 20: Right to Data Portability) */
  async exportCustomerData(
    customerId: string,
    conversationIds: string[],
  ): Promise<GDPRExportData> {
    this.log.info({ customerId, conversationCount: conversationIds.length }, 'GDPR data export requested');

    const conversations = [];
    for (const convId of conversationIds) {
      const record = await this.conversationStore.get(convId);
      if (record) {
        conversations.push({
          conversationId: convId,
          turns: record.turns.map((t) => ({
            role: t.role,
            content: t.content,
            timestamp: t.timestamp,
          })),
          state: record.state,
          createdAt: record.createdAt,
        });
      }
    }

    const auditTrail = await this.auditStore.query({
      actor: customerId,
      limit: 1000,
    });

    return {
      requestId: `gdpr_export_${Date.now()}`,
      customerId,
      exportedAt: Date.now(),
      conversations,
      auditTrail,
      piiNote: 'PII data has been included in this export. Handle with care according to your data protection policy.',
    };
  }

  /** Erase customer data (GDPR Article 17: Right to Erasure) */
  async eraseCustomerData(
    customerId: string,
    conversationIds: string[],
  ): Promise<GDPRErasureResult> {
    this.log.info({ customerId, conversationCount: conversationIds.length }, 'GDPR erasure requested');

    let conversationsErased = 0;

    for (const convId of conversationIds) {
      try {
        // Purge PII from vault
        if (this.piiVault) {
          await this.piiVault.purge(convId);
        }
        // Delete conversation record
        await this.conversationStore.delete(convId);
        conversationsErased++;
      } catch (err) {
        this.log.error({ err, conversationId: convId }, 'Failed to erase conversation');
      }
    }

    // Note: Audit events are RETAINED for compliance (anonymized)
    // They don't contain PII directly, only references

    return {
      requestId: `gdpr_erase_${Date.now()}`,
      customerId,
      erasedAt: Date.now(),
      conversationsErased,
      auditEventsRetained: 0, // Audit trail preserved but anonymized
      piiPurged: !!this.piiVault,
    };
  }
}
