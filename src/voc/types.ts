/**
 * VOC (Voice-of-Customer) Intelligence Types
 *
 * Canonical types for the NLU pipeline: language detection, intent classification,
 * entity extraction, sentiment analysis, urgency assessment, risk flags,
 * resolution tracking, and the unified VOC record.
 */

// ───── Language Detection ───────────────────────────────────────

/** Language detection result */
export interface DetectedLanguage {
  code: string;          // ISO 639-1: 'en', 'hi', 'hinglish'
  confidence: number;    // 0-1
  script?: string;       // 'latin', 'devanagari'
}

// ───── Intent Classification ────────────────────────────────────

/** Multi-label intent with confidence */
export interface ClassifiedIntent {
  label: string;
  confidence: number;
}

// ───── Entity Extraction ────────────────────────────────────────

/** Entity types extracted from customer messages */
export type EntityType =
  | 'order_number'
  | 'phone'
  | 'product_name'
  | 'awb'
  | 'email'
  | 'date'
  | 'amount'
  | 'return_id'
  | 'payment_id';

/** Typed entity extraction */
export interface ExtractedEntity {
  type: EntityType | string;
  value: string;
  rawText: string;
  confidence: number;
}

// ───── Sentiment Analysis ───────────────────────────────────────

/** Emotion labels for fine-grained sentiment */
export type Emotion = 'frustrated' | 'confused' | 'satisfied' | 'angry' | 'neutral';

/** Sentiment analysis result */
export interface SentimentResult {
  label: 'positive' | 'negative' | 'neutral';
  score: number;         // -1 to +1
  emotion?: Emotion;
}

// ───── Urgency Classification ───────────────────────────────────

/** Urgency levels */
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

/** Urgency classification result */
export interface UrgencyResult {
  level: UrgencyLevel;
  signals: string[];
}

// ───── Customer Lifecycle ───────────────────────────────────────

/** Customer lifecycle stage */
export type CustomerStage =
  | 'browsing'
  | 'pre_purchase'
  | 'post_purchase'
  | 'issue_resolution'
  | 'at_risk'
  | 'returning_customer';

// ───── Risk Flags ───────────────────────────────────────────────

/** Risk flag types */
export type RiskFlagType =
  | 'churn_risk'
  | 'legal_threat'
  | 'social_media_threat'
  | 'repeat_complaint'
  | 'high_value_customer'
  | 'policy_exception_requested';

/** Risk flags detected in message */
export interface RiskFlag {
  type: RiskFlagType;
  confidence: number;
  detail?: string;
}

// ───── Resolution Tracking ──────────────────────────────────────

/** Resolution confirmation receipt — provided after every action */
export interface ResolutionReceipt {
  actionTaken: string;       // "Looked up order status", "Initiated return"
  referenceId?: string;      // ticket ID, order number, AWB
  expectedTimeline?: string; // "Refund within 5-7 business days"
  nextSteps?: string;        // "You will receive an SMS with tracking"
}

// ───── VOC Record ───────────────────────────────────────────────

/** Knowledge source metadata from retrieval */
export interface KnowledgeSourceRef {
  source: string;
  score: number;
  type: string;
}

/** Response metadata (for outbound VOC records) */
export interface ResponseMetadata {
  confidenceScore: number;
  clarificationNeeded: boolean;
  responseLatencyMs: number;
  tokensUsed: number;
  provider: string;
  model: string;
}

/** The canonical VOC record — one per message turn */
export interface VOCRecord {
  messageId: string;
  conversationId: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  originalText: string;

  // NLU fields
  detectedLanguages: DetectedLanguage[];
  normalizedText?: string;
  intents: ClassifiedIntent[];
  entities: ExtractedEntity[];
  sentiment: SentimentResult;
  urgency: UrgencyResult;

  // Contextual fields
  topics: string[];
  customerStage?: CustomerStage;
  riskFlags: RiskFlag[];

  // Resolution tracking (from Resolution Engine)
  fcrAchieved?: boolean;
  resolutionReceipt?: ResolutionReceipt;

  // Retrieval metadata
  knowledgeSources: KnowledgeSourceRef[];

  // Response metadata (for outbound VOC records)
  responseMetadata?: ResponseMetadata;
}

// ───── Pre-Processor Output ─────────────────────────────────────

/** Pre-processor output (fast, sync, deterministic) */
export interface VOCPreProcessResult {
  detectedLanguages: DetectedLanguage[];
  normalizedText?: string;
  entities: ExtractedEntity[];
  urgency: UrgencyResult;
  riskFlags: RiskFlag[];
}
