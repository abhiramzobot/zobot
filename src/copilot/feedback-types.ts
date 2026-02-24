/**
 * Agent-to-AI Feedback Types (Phase 3E)
 */

export interface AgentFeedback {
  id: string;
  conversationId: string;
  agentId: string;
  /** What the agent actually did */
  resolutionAction: string;
  /** Whether the agent overrode the AI suggestion */
  wasOverride: boolean;
  /** Reason for override (if any) */
  overrideReason?: string;
  /** Knowledge gaps identified */
  knowledgeGaps: string[];
  /** Rating of AI suggestion quality (1-5) */
  suggestionQuality?: number;
  /** Free-text feedback */
  notes?: string;
  timestamp: number;
}

export interface FeedbackSummary {
  totalFeedback: number;
  overrideRate: number;
  avgSuggestionQuality: number;
  topOverrideReasons: Array<{ reason: string; count: number }>;
  topKnowledgeGaps: Array<{ gap: string; count: number }>;
  period: { since: number; until: number };
}
