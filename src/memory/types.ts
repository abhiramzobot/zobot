import { ConversationState, ConversationTurn, StructuredMemory } from '../config/types';

export interface ConversationRecord {
  conversationId: string;
  state: ConversationState;
  turns: ConversationTurn[];
  structuredMemory: StructuredMemory;
  ticketId?: string;
  clarificationCount: number;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
  /** Visitor identity for session linking */
  visitorId?: string;
  /** Timestamp when conversation was ended */
  endedAt?: number;
  /** Who ended the conversation */
  endedBy?: 'user' | 'bot' | 'system';
  /** CSAT rating (1-5) submitted after conversation end */
  csatRating?: number;
  /** CSAT feedback text */
  csatFeedback?: string;
  /** Primary intent classification for this conversation */
  primaryIntent?: string;
  // ───── Omnichannel Continuity (Enhancement v2) ─────
  /** Source channel for cross-channel linking */
  sourceChannel?: string;
  /** Linked conversation IDs from other channels */
  linkedConversationIds?: string[];
  /** Customer ID for cross-channel identity */
  customerId?: string;
}

export interface ConversationStore {
  get(conversationId: string): Promise<ConversationRecord | null>;
  save(record: ConversationRecord): Promise<void>;
  delete(conversationId: string): Promise<void>;
}
