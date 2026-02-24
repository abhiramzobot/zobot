/**
 * VOC Pre-Processor — Fast, synchronous, deterministic pre-LLM analysis.
 *
 * Runs BEFORE the LLM call (<10ms target). Extracts:
 * - Language detection (Devanagari vs Latin vs Hinglish)
 * - Entity extraction (order numbers, AWBs, phones, emails, amounts)
 * - Urgency assessment (keywords + context signals)
 * - Risk flag detection (legal threat, social media, repeat complaint, policy exception)
 */

import {
  DetectedLanguage,
  ExtractedEntity,
  UrgencyResult,
  UrgencyLevel,
  RiskFlag,
  VOCPreProcessResult,
} from './types';
import { logger } from '../observability/logger';
import { vocPreprocessDuration } from '../observability/metrics';

// ───── Regex Patterns ───────────────────────────────────────────

/** Dentalkart order number patterns */
const ORDER_PATTERNS = [
  { regex: /\b(DK-\d{4,10})\b/gi, type: 'order_number' as const },
  { regex: /\b(Q2[A-Z0-9]{4,8})\b/g, type: 'order_number' as const },
  { regex: /\b(RP-[A-Z0-9]{4,8})\b/gi, type: 'order_number' as const },
  { regex: /\b(M0\d{8,12})\b/g, type: 'order_number' as const },
];

/** AWB (Airway Bill) patterns */
const AWB_PATTERN = /\b(\d{10,18})\b/g;

/** Indian phone number */
const PHONE_PATTERN = /(?:\+91[\s-]?)?([6-9]\d{9})\b/g;

/** Email */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Amount (INR) */
const AMOUNT_PATTERN = /₹\s?(\d[\d,]*(?:\.\d{1,2})?)/g;

/** Return ID */
const RETURN_ID_PATTERN = /\b(RET-?\d{4,10})\b/gi;

/** Razorpay payment ID */
const PAYMENT_ID_PATTERN = /\b(pay_[A-Za-z0-9]{10,20})\b/g;

// ───── Urgency Keywords ─────────────────────────────────────────

const URGENCY_CRITICAL_KEYWORDS = [
  'consumer court', 'legal action', 'legal notice', 'lawyer', 'court',
  'consumer forum', 'adalat', 'case file', 'fir', 'police',
  'consumer complaint forum',
  // Hindi
  'kanoon', 'adalat', 'court karta', 'case karunga', 'police mein',
];

const URGENCY_HIGH_KEYWORDS = [
  'urgent', 'asap', 'emergency', 'immediately', 'right now',
  'fed up', 'worst', 'pathetic', 'useless', 'terrible', 'disgusting',
  'scam', 'fraud', 'cheat', 'loot', 'dhoka',
  // Hindi
  'jaldi', 'turant', 'abhi', 'bahut bura', 'bekaar', 'ghatiya',
  'dhoka', 'loot', 'paagal',
];

const URGENCY_MEDIUM_KEYWORDS = [
  'angry', 'frustrated', 'disappointed', 'waiting', 'delay',
  'still not', 'no update', 'how long', 'when will',
  // Hindi
  'gussa', 'pareshan', 'intezaar', 'kab tak', 'abhi tak nahi',
];

// ───── Social Media Keywords ────────────────────────────────────

const SOCIAL_MEDIA_KEYWORDS = [
  'twitter', 'facebook', 'instagram', 'youtube', 'social media',
  'review', 'google review', 'trustpilot', 'post online', 'viral',
  'mouthshut', 'complaint board',
  // Hindi
  'social media pe', 'review daal', 'post karunga',
];

// ───── Policy Exception Keywords ────────────────────────────────

const POLICY_EXCEPTION_KEYWORDS = [
  'exception', 'special case', 'please consider', 'one time',
  'return window', 'expired warranty', 'past deadline',
  'can you make an exception', 'outside policy',
  // Hindi
  'ek baar', 'exception de do', 'policy ke bahar',
  'deadline nikal gayi', 'warranty khatam',
];

// ───── Devanagari Detection ─────────────────────────────────────

const DEVANAGARI_RANGE = /[\u0900-\u097F]/;
const HINGLISH_MARKERS = new Set([
  'hai', 'hain', 'kya', 'kaise', 'kab', 'kahan', 'mera', 'meri',
  'aap', 'aapka', 'nahi', 'nhi', 'bhi', 'aur', 'lekin', 'par',
  'chahiye', 'karo', 'karna', 'karke', 'batao', 'bataye', 'dijiye',
  'hota', 'hoti', 'hote', 'tha', 'thi', 'wala', 'wali',
  'yaar', 'bhai', 'sahab', 'ji', 'accha', 'theek',
  'abhi', 'bahut', 'bohot', 'bilkul', 'sirf',
]);

// ───── Pre-Processor Class ──────────────────────────────────────

export class VOCPreProcessor {
  private readonly log = logger.child({ component: 'voc-preprocessor' });

  /**
   * Run fast pre-LLM analysis on inbound message.
   * Target: <10ms synchronous execution.
   */
  process(
    text: string,
    conversationContext?: {
      turnCount?: number;
      clarificationCount?: number;
      previousIntents?: string[];
      previousEntities?: string[];
    },
  ): VOCPreProcessResult {
    const start = performance.now();

    const detectedLanguages = this.detectLanguage(text);
    const entities = this.extractEntities(text);
    const urgency = this.assessUrgency(text, conversationContext);
    const riskFlags = this.detectRiskFlags(text, conversationContext);

    const durationMs = performance.now() - start;
    vocPreprocessDuration.observe(durationMs / 1000);

    this.log.debug({ durationMs: durationMs.toFixed(2), entityCount: entities.length, urgency: urgency.level }, 'Pre-processing complete');

    return {
      detectedLanguages,
      entities,
      urgency,
      riskFlags,
    };
  }

  // ───── Language Detection ───────────────────────────────────

  private detectLanguage(text: string): DetectedLanguage[] {
    const results: DetectedLanguage[] = [];
    const chars = [...text];
    const totalChars = chars.filter((c) => /\S/.test(c)).length;
    if (totalChars === 0) {
      return [{ code: 'en', confidence: 0.5, script: 'latin' }];
    }

    const devanagariCount = chars.filter((c) => DEVANAGARI_RANGE.test(c)).length;
    const devanagariRatio = devanagariCount / totalChars;

    // Pure Devanagari Hindi
    if (devanagariRatio > 0.4) {
      results.push({ code: 'hi', confidence: Math.min(0.6 + devanagariRatio * 0.4, 1), script: 'devanagari' });
      return results;
    }

    // Check for Hinglish (Latin script Hindi words)
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const hinglishCount = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
    const hinglishRatio = words.length > 0 ? hinglishCount / words.length : 0;

    if (hinglishRatio > 0.15) {
      results.push({ code: 'hinglish', confidence: Math.min(0.5 + hinglishRatio, 1), script: 'latin' });
      // Also mark English as secondary
      results.push({ code: 'en', confidence: Math.max(0.3, 1 - hinglishRatio), script: 'latin' });
    } else {
      results.push({ code: 'en', confidence: 0.9, script: 'latin' });
    }

    return results;
  }

  // ───── Entity Extraction ────────────────────────────────────

  private extractEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Order numbers
    for (const pattern of ORDER_PATTERNS) {
      let match: RegExpExecArray | null;
      pattern.regex.lastIndex = 0;
      while ((match = pattern.regex.exec(text)) !== null) {
        entities.push({
          type: 'order_number',
          value: match[1],
          rawText: match[0],
          confidence: 0.95,
        });
      }
    }

    // Phone numbers
    let match: RegExpExecArray | null;
    PHONE_PATTERN.lastIndex = 0;
    while ((match = PHONE_PATTERN.exec(text)) !== null) {
      entities.push({
        type: 'phone',
        value: match[1],
        rawText: match[0],
        confidence: 0.9,
      });
    }

    // Emails
    EMAIL_PATTERN.lastIndex = 0;
    while ((match = EMAIL_PATTERN.exec(text)) !== null) {
      entities.push({
        type: 'email',
        value: match[0],
        rawText: match[0],
        confidence: 0.95,
      });
    }

    // Amounts
    AMOUNT_PATTERN.lastIndex = 0;
    while ((match = AMOUNT_PATTERN.exec(text)) !== null) {
      entities.push({
        type: 'amount',
        value: match[1].replace(/,/g, ''),
        rawText: match[0],
        confidence: 0.9,
      });
    }

    // Return IDs
    RETURN_ID_PATTERN.lastIndex = 0;
    while ((match = RETURN_ID_PATTERN.exec(text)) !== null) {
      entities.push({
        type: 'return_id',
        value: match[1],
        rawText: match[0],
        confidence: 0.95,
      });
    }

    // Payment IDs (Razorpay)
    PAYMENT_ID_PATTERN.lastIndex = 0;
    while ((match = PAYMENT_ID_PATTERN.exec(text)) !== null) {
      entities.push({
        type: 'payment_id',
        value: match[1],
        rawText: match[0],
        confidence: 0.95,
      });
    }

    // AWB — only if no order number matched at that position (avoid false positives)
    const orderPositions = new Set(entities.filter((e) => e.type === 'order_number').map((e) => e.rawText));
    AWB_PATTERN.lastIndex = 0;
    while ((match = AWB_PATTERN.exec(text)) !== null) {
      const val = match[1];
      // Skip if it looks like a phone number or already matched as order
      if (entities.some((e) => e.value === val)) continue;
      // AWBs are typically 10-18 digits; only flag if in shipment context
      const contextWindow = text.substring(Math.max(0, match.index - 30), match.index + val.length + 30).toLowerCase();
      if (contextWindow.includes('awb') || contextWindow.includes('tracking') || contextWindow.includes('shipment') || contextWindow.includes('courier')) {
        entities.push({
          type: 'awb',
          value: val,
          rawText: match[0],
          confidence: 0.7,
        });
      }
    }

    return entities;
  }

  // ───── Urgency Assessment ───────────────────────────────────

  private assessUrgency(
    text: string,
    ctx?: {
      turnCount?: number;
      clarificationCount?: number;
    },
  ): UrgencyResult {
    const lower = text.toLowerCase();
    const signals: string[] = [];
    let level: UrgencyLevel = 'low';

    // Keyword-based urgency
    if (URGENCY_CRITICAL_KEYWORDS.some((kw) => lower.includes(kw))) {
      level = 'critical';
      signals.push('legal_threat_keywords');
    } else if (URGENCY_HIGH_KEYWORDS.some((kw) => lower.includes(kw))) {
      level = 'high';
      signals.push('frustration_keywords');
    } else if (URGENCY_MEDIUM_KEYWORDS.some((kw) => lower.includes(kw))) {
      level = 'medium';
      signals.push('concern_keywords');
    }

    // Context-based urgency elevation
    if (ctx?.turnCount && ctx.turnCount > 10 && level === 'low') {
      level = 'medium';
      signals.push('long_conversation');
    }
    if (ctx?.clarificationCount && ctx.clarificationCount > 1) {
      if (level === 'low') level = 'medium';
      if (level === 'medium') level = 'high';
      signals.push('repeated_clarification');
    }

    return { level, signals };
  }

  // ───── Risk Flag Detection ──────────────────────────────────

  private detectRiskFlags(
    text: string,
    ctx?: {
      previousIntents?: string[];
      previousEntities?: string[];
    },
  ): RiskFlag[] {
    const lower = text.toLowerCase();
    const flags: RiskFlag[] = [];

    // Legal threat
    if (URGENCY_CRITICAL_KEYWORDS.some((kw) => lower.includes(kw))) {
      flags.push({
        type: 'legal_threat',
        confidence: 0.85,
        detail: 'Legal/consumer court keywords detected',
      });
    }

    // Social media threat
    if (SOCIAL_MEDIA_KEYWORDS.some((kw) => lower.includes(kw))) {
      flags.push({
        type: 'social_media_threat',
        confidence: 0.8,
        detail: 'Social media threat keywords detected',
      });
    }

    // Policy exception requested
    if (POLICY_EXCEPTION_KEYWORDS.some((kw) => lower.includes(kw))) {
      flags.push({
        type: 'policy_exception_requested',
        confidence: 0.75,
        detail: 'Customer requesting action outside standard policy',
      });
    }

    // Repeat complaint detection (same intent/entity mentioned in previous turns)
    if (ctx?.previousIntents && ctx.previousIntents.length >= 2) {
      // Check if the same intent appeared 2+ times already
      const intentCounts = new Map<string, number>();
      for (const intent of ctx.previousIntents) {
        intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
      }
      for (const [intent, count] of intentCounts) {
        if (count >= 2 && intent !== 'greeting' && intent !== 'unknown') {
          flags.push({
            type: 'repeat_complaint',
            confidence: 0.8,
            detail: `Intent "${intent}" repeated ${count} times across conversation`,
          });
          break;
        }
      }
    }

    return flags;
  }
}
