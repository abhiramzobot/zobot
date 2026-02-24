import { ConversationState, Channel } from '../config/types';

// ─── Learning Artifact Types ──────────────────────────────────────

export type LearningArtifactType =
  | 'faq_discovery'
  | 'knowledge_gap'
  | 'escalation_pattern'
  | 'response_quality'
  | 'intent_pattern'
  | 'sentiment_trend'
  | 'voc_quality';

export type FAQCandidateStatus = 'pending' | 'approved' | 'rejected';

// ─── Conversation Summary ─────────────────────────────────────────
// Created by ConversationCollector when a conversation reaches a terminal state.

export interface ConversationSummary {
  conversationId: string;
  channel: string;
  tenantId: string;
  startedAt: number;
  endedAt: number;
  turnCount: number;
  finalState: ConversationState;
  /** All intents detected across turns */
  intents: string[];
  /** Most frequently occurring intent */
  primaryIntent: string;
  /** Tools called during conversation */
  toolsUsed: string[];
  /** Whether conversation ended in ESCALATED state */
  escalated: boolean;
  escalationReason?: string;
  clarificationCount: number;
  /** User queries that returned no knowledge base results */
  knowledgeGaps: string[];
  /** User messages (PII-redacted) for FAQ discovery */
  userMessages: string[];
  /** Bot responses for quality analysis */
  botMessages: string[];
  /** True if resolved without escalation */
  resolvedByBot: boolean;
  /** Which LLM provider handled this conversation */
  llmProvider?: string;
  llmModel?: string;
  promptVersion?: string;
  /** Inferred from final messages */
  satisfaction: 'positive' | 'negative' | 'neutral';
  // ───── VOC Aggregate Fields (optional, populated when VOC pipeline is active) ─────
  /** Average sentiment score across turns (-1 to +1) */
  avgSentimentScore?: number;
  /** Average LLM confidence score across turns (0-1) */
  avgConfidenceScore?: number;
  /** Languages detected in this conversation */
  detectedLanguages?: string[];
  /** Peak urgency level during conversation */
  urgencyPeakLevel?: string;
  /** Risk flags detected during conversation */
  riskFlagsDetected?: string[];
  /** Entity types extracted (e.g., 'order_number', 'phone') */
  entityTypes?: string[];
  /** Customer lifecycle stage */
  customerStage?: string;
  /** Whether first contact resolution was achieved */
  fcrAchieved?: boolean;
  /** Whether resolved without escalation (for FCR calculation) */
  resolvedWithoutEscalation?: boolean;
}

// ─── Learning Artifact ────────────────────────────────────────────
// Output of analysis pipeline.

export interface LearningArtifact {
  id: string;
  type: LearningArtifactType;
  data: Record<string, unknown>;
  createdAt: number;
  /** YYYY-MM-DD of the analysis run */
  analysisDate: string;
  /** 0–1 confidence score */
  confidence: number;
}

// ─── FAQ Candidate ────────────────────────────────────────────────
// Discovered FAQ entry pending admin review.

export interface FAQCandidate {
  id: string;
  question: string;
  suggestedAnswer: string;
  /** How many times this question cluster appeared */
  frequency: number;
  /** Conversation IDs where it appeared */
  sources: string[];
  status: FAQCandidateStatus;
  category: string;
  tags: string[];
  createdAt: number;
}

// ─── Pipeline Result ──────────────────────────────────────────────

export interface PipelineResult {
  artifactCount: number;
  faqCandidateCount: number;
  summariesAnalyzed: number;
  durationMs: number;
  analysisDate: string;
  analyzerResults: Record<string, { count: number; status: 'success' | 'error' }>;
}

// ─── Learning Report ──────────────────────────────────────────────
// Aggregated report for admin dashboard.

export interface LearningReport {
  period: { from: number; to: number };
  totalConversations: number;
  botResolutionRate: number;
  escalationRate: number;
  avgTurnsToResolution: number;
  topIntents: Array<{ intent: string; count: number; resolutionRate: number }>;
  topKnowledgeGaps: Array<{ query: string; frequency: number }>;
  faqCandidatesPending: number;
  providerComparison?: Array<{
    provider: string;
    model: string;
    conversationCount: number;
    resolutionRate: number;
    avgLatencyMs: number;
  }>;
}
