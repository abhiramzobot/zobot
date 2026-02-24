import { ConversationState } from '../config/types';

/** Lightweight session summary for history listing */
export interface ChatSessionSummary {
  conversationId: string;
  visitorId: string;
  state: ConversationState;
  /** First user message as subject */
  subject: string;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  endedBy?: 'user' | 'bot' | 'system';
  csatRating?: number;
  primaryIntent?: string;
  ticketId?: string;
}

/** CSAT submission data */
export interface CSATSubmission {
  conversationId: string;
  visitorId: string;
  rating: number; // 1-5
  feedback?: string;
  submittedAt: number;
}

/** Session store interface */
export interface ChatSessionStore {
  /** Index or update a session summary (called after every conversation save) */
  indexSession(summary: ChatSessionSummary): Promise<void>;
  /** Get all sessions for a visitor, sorted by recency */
  getSessionsByVisitor(visitorId: string, limit?: number): Promise<ChatSessionSummary[]>;
  /** Get a single session summary */
  getSessionSummary(conversationId: string): Promise<ChatSessionSummary | null>;
  /** Save CSAT feedback */
  saveCSAT(csat: CSATSubmission): Promise<void>;
  /** Get CSAT for a conversation */
  getCSAT(conversationId: string): Promise<CSATSubmission | null>;
}
