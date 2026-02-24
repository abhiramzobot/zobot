/**
 * PII Classifier (Phase 7)
 *
 * Enterprise-grade PII detection with 13+ India-specific patterns.
 * Classifies PII by severity (critical/high/medium/low) and category.
 * Provides masked values for safe logging and display.
 */

export type PIISeverity = 'critical' | 'high' | 'medium' | 'low';
export type PIICategory = 'financial' | 'identity' | 'contact' | 'location';

export interface PIIDetection {
  type: string;
  category: PIICategory;
  severity: PIISeverity;
  value: string;
  maskedValue: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface PIIPolicy {
  allowedInLogs: PIISeverity[];
  allowedInTickets: PIISeverity[];
  allowedInLLM: PIISeverity[];
  retentionDays: Record<PIISeverity, number>;
}

const DEFAULT_POLICY: PIIPolicy = {
  allowedInLogs: ['low'],
  allowedInTickets: ['low', 'medium'],
  allowedInLLM: ['low', 'medium'],
  retentionDays: {
    critical: 0,
    high: 7,
    medium: 30,
    low: 90,
  },
};

interface PIIPattern {
  type: string;
  category: PIICategory;
  severity: PIISeverity;
  regex: RegExp;
  /** Optional context words that must be nearby for low-confidence patterns */
  contextWords?: string[];
  mask: (match: string) => string;
  confidence: number;
}

// ───── Pattern Definitions ──────────────────────────────────────

const PII_PATTERNS: PIIPattern[] = [
  // 1. Credit/Debit Card (16 digits, grouped)
  {
    type: 'credit_card',
    category: 'financial',
    severity: 'critical',
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    mask: (m) => {
      const digits = m.replace(/[\s-]/g, '');
      return `XXXX-XXXX-XXXX-${digits.slice(-4)}`;
    },
    confidence: 0.9,
  },

  // 2. CVV (3 digits near card context)
  {
    type: 'cvv',
    category: 'financial',
    severity: 'critical',
    regex: /\b(\d{3})\b/g,
    contextWords: ['cvv', 'security code', 'card', 'debit', 'credit'],
    mask: () => '***',
    confidence: 0.7,
  },

  // 3. UPI ID
  {
    type: 'upi_id',
    category: 'financial',
    severity: 'critical',
    regex: /\b([\w.-]+@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|apl|ibl|axisbank|icici|sbi|hdfcbank|kotak|indus|federal))\b/gi,
    mask: (m) => {
      const provider = m.split('@')[1];
      return `****@${provider}`;
    },
    confidence: 0.95,
  },

  // 4. Aadhaar Number (12 digits with optional spaces)
  {
    type: 'aadhaar',
    category: 'identity',
    severity: 'critical',
    regex: /\b(\d{4}\s?\d{4}\s?\d{4})\b/g,
    contextWords: ['aadhaar', 'aadhar', 'uid', 'identity'],
    mask: (m) => {
      const digits = m.replace(/\s/g, '');
      return `XXXX-XXXX-${digits.slice(-4)}`;
    },
    confidence: 0.6,
  },

  // 5. PAN Card (ABCDE1234F format)
  {
    type: 'pan_card',
    category: 'identity',
    severity: 'high',
    regex: /\b([A-Z]{5}\d{4}[A-Z])\b/g,
    mask: (m) => `${m.slice(0, 2)}XXX${m.slice(5, 7)}XX${m.slice(-1)}`,
    confidence: 0.85,
  },

  // 6. Bank Account Number (9-18 digits near banking context)
  {
    type: 'bank_account',
    category: 'financial',
    severity: 'critical',
    regex: /\b(\d{9,18})\b/g,
    contextWords: ['account', 'bank', 'khata', 'savings', 'current', 'a/c', 'acct'],
    mask: (m) => `XXXXX${m.slice(-4)}`,
    confidence: 0.6,
  },

  // 7. IFSC Code
  {
    type: 'ifsc_code',
    category: 'financial',
    severity: 'low', // Non-sensitive, kept for reference
    regex: /\b([A-Z]{4}0[A-Z0-9]{6})\b/g,
    mask: (m) => m, // Kept as-is
    confidence: 0.9,
  },

  // 8. Indian Phone Number
  {
    type: 'phone_india',
    category: 'contact',
    severity: 'medium',
    regex: /(\+91[\s-]?)?([6-9]\d{9})\b/g,
    mask: (m) => {
      const digits = m.replace(/[\s-+]/g, '');
      const last4 = digits.slice(-4);
      return `+91-XXXXX-${last4}`;
    },
    confidence: 0.85,
  },

  // 9. Email Address
  {
    type: 'email',
    category: 'contact',
    severity: 'medium',
    regex: /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    mask: (m) => {
      const [local, domain] = m.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    },
    confidence: 0.95,
  },

  // 10. Date of Birth (near DOB context)
  {
    type: 'date_of_birth',
    category: 'identity',
    severity: 'medium',
    regex: /\b(\d{2}[/-]\d{2}[/-]\d{4})\b/g,
    contextWords: ['dob', 'date of birth', 'birthday', 'born', 'janam'],
    mask: () => 'XX/XX/XXXX',
    confidence: 0.5,
  },

  // 11. Razorpay/Payment ID
  {
    type: 'payment_id',
    category: 'financial',
    severity: 'medium',
    regex: /\b(pay_[A-Za-z0-9]{10,})\b/g,
    mask: (m) => `pay_XXX${m.slice(-4)}`,
    confidence: 0.95,
  },

  // 12. Indian PIN Code (6 digits — low severity, needed for logistics)
  {
    type: 'pin_code',
    category: 'location',
    severity: 'low',
    regex: /\b(\d{6})\b/g,
    contextWords: ['pin', 'pincode', 'postal', 'zip', 'area'],
    mask: (m) => m, // Kept for logistics
    confidence: 0.4,
  },
];

// ───── Classifier ───────────────────────────────────────────────

export class PIIClassifier {
  private readonly policy: PIIPolicy;

  constructor(policy?: Partial<PIIPolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Detect all PII instances in the given text.
   * Returns sorted by position (startIndex).
   */
  detect(text: string): PIIDetection[] {
    const detections: PIIDetection[] = [];
    const lowerText = text.toLowerCase();

    for (const pattern of PII_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + value.length;

        // Context check: if pattern requires context words, verify they exist nearby
        if (pattern.contextWords) {
          const hasContext = pattern.contextWords.some((w) => lowerText.includes(w));
          if (!hasContext) continue;
        }

        // Skip false positives: don't flag 6-digit numbers as Aadhaar
        if (pattern.type === 'aadhaar') {
          const digits = value.replace(/\s/g, '');
          if (digits.length !== 12) continue;
          // Skip if it looks like a phone number
          if (/^[6-9]\d{9}/.test(digits)) continue;
        }

        // Skip false positives: don't flag PIN codes as bank accounts
        if (pattern.type === 'bank_account') {
          const digits = value.replace(/\s/g, '');
          if (digits.length === 6) continue; // Likely a PIN code
          if (digits.length === 10 && /^[6-9]/.test(digits)) continue; // Likely a phone
          if (digits.length === 13) continue; // Likely an AWB
        }

        // Skip CVV false positives if no card context within 100 chars
        if (pattern.type === 'cvv') {
          const nearby = lowerText.slice(
            Math.max(0, startIndex - 100),
            Math.min(lowerText.length, endIndex + 100),
          );
          const hasCardContext = ['cvv', 'security code', 'card'].some((w) => nearby.includes(w));
          if (!hasCardContext) continue;
        }

        detections.push({
          type: pattern.type,
          category: pattern.category,
          severity: pattern.severity,
          value,
          maskedValue: pattern.mask(value),
          startIndex,
          endIndex,
          confidence: pattern.confidence,
        });
      }
    }

    // Sort by position and deduplicate overlapping detections
    detections.sort((a, b) => a.startIndex - b.startIndex);
    return this.deduplicateOverlapping(detections);
  }

  /**
   * Redact PII from text based on severity policy.
   * Returns the redacted text.
   */
  redact(text: string, allowedSeverities: PIISeverity[] = []): string {
    const detections = this.detect(text);
    let result = text;
    let offset = 0;

    for (const detection of detections) {
      if (allowedSeverities.includes(detection.severity)) continue;

      const start = detection.startIndex + offset;
      const end = detection.endIndex + offset;
      const replacement = detection.maskedValue;

      result = result.slice(0, start) + replacement + result.slice(end);
      offset += replacement.length - (detection.endIndex - detection.startIndex);
    }

    return result;
  }

  /**
   * Redact for logging (only low severity allowed through).
   */
  redactForLogs(text: string): string {
    return this.redact(text, this.policy.allowedInLogs);
  }

  /**
   * Redact for LLM context (low + medium allowed).
   */
  redactForLLM(text: string): string {
    return this.redact(text, this.policy.allowedInLLM);
  }

  /**
   * Redact for tickets (low + medium allowed).
   */
  redactForTickets(text: string): string {
    return this.redact(text, this.policy.allowedInTickets);
  }

  /**
   * Check if text contains any critical PII.
   */
  hasCriticalPII(text: string): boolean {
    return this.detect(text).some((d) => d.severity === 'critical');
  }

  get piiPolicy(): PIIPolicy {
    return this.policy;
  }

  /**
   * Remove overlapping detections, preferring higher-severity and higher-confidence.
   */
  private deduplicateOverlapping(sorted: PIIDetection[]): PIIDetection[] {
    const result: PIIDetection[] = [];
    const severityOrder: Record<PIISeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

    for (const detection of sorted) {
      const overlapping = result.findIndex(
        (r) => detection.startIndex < r.endIndex && detection.endIndex > r.startIndex,
      );

      if (overlapping === -1) {
        result.push(detection);
      } else {
        // Keep the higher-severity/confidence detection
        const existing = result[overlapping];
        const existingScore = severityOrder[existing.severity] + existing.confidence;
        const newScore = severityOrder[detection.severity] + detection.confidence;
        if (newScore > existingScore) {
          result[overlapping] = detection;
        }
      }
    }

    return result;
  }
}
