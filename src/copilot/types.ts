/**
 * Agent Co-Pilot Types (Phase 2A)
 */

import { Channel } from '../config/types';

export type CoPilotMode = 'auto' | 'suggest' | 'off';

export interface CoPilotConfig {
  enabled: boolean;
  mode: CoPilotMode;
  /** Auto-approve responses with confidence above this threshold */
  autoApproveThreshold: number;
  /** Maximum suggestions to show */
  maxSuggestions: number;
}

export interface CoPilotSuggestion {
  id: string;
  type: 'draft_response' | 'smart_action' | 'knowledge_article' | 'canned_response';
  content: string;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface AgentContextPanel {
  conversationId: string;
  visitorName?: string;
  channel: Channel;
  currentState: string;
  turnCount: number;
  sentiment?: { label: string; score: number };
  intent: string;
  /** Customer 360 summary */
  customerSummary?: string;
  /** Relevant knowledge articles */
  knowledgeArticles: Array<{ title: string; snippet: string; relevance: number }>;
  /** Suggested actions */
  suggestedActions: SmartAction[];
  /** Draft responses */
  draftResponses: CoPilotSuggestion[];
  /** Quality warnings */
  qualityWarnings: string[];
}

export interface SmartAction {
  id: string;
  label: string;
  description: string;
  actionType: 'tool_call' | 'state_change' | 'template' | 'escalate';
  payload: Record<string, unknown>;
}

export interface CoPilotFeedback {
  suggestionId: string;
  accepted: boolean;
  modifiedContent?: string;
  reason?: string;
  agentId: string;
  timestamp: number;
}
