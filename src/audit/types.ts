/**
 * Audit Infrastructure Types (Phase 0B)
 *
 * Append-only audit trail with SHA-256 chain hashing.
 */

export type AuditCategory =
  | 'conversation'
  | 'tool_execution'
  | 'escalation'
  | 'state_transition'
  | 'pii_access'
  | 'pii_tokenize'
  | 'pii_purge'
  | 'config_change'
  | 'admin_action'
  | 'copilot'
  | 'sla'
  | 'gdpr'
  | 'order_modification'
  | 'outbound';

export interface AuditEvent {
  eventId: string;
  timestamp: number;
  /** Who performed the action: 'system', 'bot', agent email, or visitor ID */
  actor: string;
  /** What happened */
  action: string;
  /** Category for filtering */
  category: AuditCategory;
  /** Conversation context */
  conversationId?: string;
  tenantId?: string;
  /** Additional structured details (PII-redacted) */
  details: Record<string, unknown>;
  /** SHA-256 hash of this event + previous event hash (chain integrity) */
  dataHash: string;
  /** Previous event hash (for chain verification) */
  previousHash?: string;
}

export interface AuditFilter {
  conversationId?: string;
  tenantId?: string;
  category?: AuditCategory;
  actor?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
  getLastHash(): Promise<string>;
  /** Verify chain integrity. Returns { valid, brokenAt? } */
  verifyIntegrity(conversationId?: string): Promise<{ valid: boolean; brokenAt?: string }>;
}
