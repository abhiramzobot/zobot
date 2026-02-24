/**
 * PII Redactor
 *
 * Enhanced with PIIClassifier (Phase 7) — 13+ India-specific patterns
 * with severity-based filtering. Falls back to basic regex if classifier
 * is not initialized.
 */

import { PIIClassifier, PIISeverity } from '../security/pii-classifier';

// ───── Singleton PIIClassifier ──────────────────────────────────

let classifierInstance: PIIClassifier | undefined;

export function initPIIRedactor(classifier?: PIIClassifier): void {
  classifierInstance = classifier ?? new PIIClassifier();
}

// ───── Basic Fallback Patterns ──────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d[\d\s\-().]{7,}\d)/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

function fallbackRedact(input: string): string {
  return input
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
    .replace(CREDIT_CARD_REGEX, '[CC_REDACTED]')
    .replace(SSN_REGEX, '[SSN_REDACTED]')
    .replace(PHONE_REGEX, '[PHONE_REDACTED]');
}

// ───── Public API ───────────────────────────────────────────────

/**
 * Redact PII from a string.
 * Uses the enhanced PIIClassifier if initialized, otherwise falls back to basic regex.
 */
export function redactPII(input: string, allowedSeverities?: PIISeverity[]): string {
  if (classifierInstance) {
    return classifierInstance.redact(input, allowedSeverities ?? []);
  }
  return fallbackRedact(input);
}

/**
 * Redact PII from all string values in an object (recursive).
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === 'string') {
      (result as Record<string, unknown>)[key] = redactPII(val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      (result as Record<string, unknown>)[key] = redactObject(val as Record<string, unknown>);
    }
  }
  return result;
}

/**
 * Check if text contains any critical PII (card numbers, Aadhaar, UPI, bank accounts).
 */
export function hasCriticalPII(text: string): boolean {
  if (classifierInstance) {
    return classifierInstance.hasCriticalPII(text);
  }
  // Fallback: check for credit card patterns
  return CREDIT_CARD_REGEX.test(text);
}
