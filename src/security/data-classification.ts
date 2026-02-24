/**
 * Data Classification Matrix (Phase 4G)
 *
 * 9-category matrix with retention/access rules.
 */

export type DataCategory =
  | 'conversation_content'
  | 'customer_pii'
  | 'payment_data'
  | 'order_data'
  | 'system_logs'
  | 'analytics_data'
  | 'audit_trail'
  | 'knowledge_base'
  | 'configuration';

export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export interface DataClassification {
  category: DataCategory;
  sensitivity: DataSensitivity;
  retentionDays: number;
  encryptionRequired: boolean;
  auditAccessRequired: boolean;
  gdprRelevant: boolean;
  piiContained: boolean;
}

const CLASSIFICATION_MATRIX: Record<DataCategory, DataClassification> = {
  conversation_content: {
    category: 'conversation_content',
    sensitivity: 'confidential',
    retentionDays: 90,
    encryptionRequired: true,
    auditAccessRequired: true,
    gdprRelevant: true,
    piiContained: true,
  },
  customer_pii: {
    category: 'customer_pii',
    sensitivity: 'restricted',
    retentionDays: 30,
    encryptionRequired: true,
    auditAccessRequired: true,
    gdprRelevant: true,
    piiContained: true,
  },
  payment_data: {
    category: 'payment_data',
    sensitivity: 'restricted',
    retentionDays: 0, // Never stored
    encryptionRequired: true,
    auditAccessRequired: true,
    gdprRelevant: true,
    piiContained: true,
  },
  order_data: {
    category: 'order_data',
    sensitivity: 'confidential',
    retentionDays: 365,
    encryptionRequired: false,
    auditAccessRequired: true,
    gdprRelevant: true,
    piiContained: false,
  },
  system_logs: {
    category: 'system_logs',
    sensitivity: 'internal',
    retentionDays: 30,
    encryptionRequired: false,
    auditAccessRequired: false,
    gdprRelevant: false,
    piiContained: false,
  },
  analytics_data: {
    category: 'analytics_data',
    sensitivity: 'internal',
    retentionDays: 365,
    encryptionRequired: false,
    auditAccessRequired: false,
    gdprRelevant: false,
    piiContained: false,
  },
  audit_trail: {
    category: 'audit_trail',
    sensitivity: 'confidential',
    retentionDays: 730, // 2 years
    encryptionRequired: true,
    auditAccessRequired: false, // Audit of audit creates recursion
    gdprRelevant: false,
    piiContained: false,
  },
  knowledge_base: {
    category: 'knowledge_base',
    sensitivity: 'internal',
    retentionDays: -1, // No expiry
    encryptionRequired: false,
    auditAccessRequired: false,
    gdprRelevant: false,
    piiContained: false,
  },
  configuration: {
    category: 'configuration',
    sensitivity: 'confidential',
    retentionDays: -1, // No expiry
    encryptionRequired: false,
    auditAccessRequired: true,
    gdprRelevant: false,
    piiContained: false,
  },
};

export function getClassification(category: DataCategory): DataClassification {
  return CLASSIFICATION_MATRIX[category];
}

export function getAllClassifications(): DataClassification[] {
  return Object.values(CLASSIFICATION_MATRIX);
}

export function isRetentionExpired(category: DataCategory, createdAt: number): boolean {
  const classification = CLASSIFICATION_MATRIX[category];
  if (classification.retentionDays <= 0) return false; // Never expires
  const expiresAt = createdAt + classification.retentionDays * 86400 * 1000;
  return Date.now() > expiresAt;
}
