/**
 * Conversation Rate Limiter (Phase 4F)
 *
 * Layer 2: max conversations/hr, max messages/conversation.
 */

import { logger } from '../observability/logger';

interface ConversationLimits {
  maxConversationsPerHour: number;
  maxMessagesPerConversation: number;
}

const DEFAULT_LIMITS: ConversationLimits = {
  maxConversationsPerHour: 5,
  maxMessagesPerConversation: 50,
};

export class ConversationRateLimiter {
  private readonly conversationStarts = new Map<string, number[]>(); // visitorId → timestamps
  private readonly messageCounts = new Map<string, number>(); // conversationId → count

  constructor(private readonly limits: ConversationLimits = DEFAULT_LIMITS) {}

  /** Check if a new conversation is allowed */
  canStartConversation(visitorId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const starts = (this.conversationStarts.get(visitorId) ?? []).filter((ts) => ts > hourAgo);
    this.conversationStarts.set(visitorId, starts);

    if (starts.length >= this.limits.maxConversationsPerHour) {
      return { allowed: false, reason: `Max ${this.limits.maxConversationsPerHour} conversations/hour exceeded` };
    }

    starts.push(now);
    return { allowed: true };
  }

  /** Check if a message is allowed in this conversation */
  canSendMessage(conversationId: string): { allowed: boolean; reason?: string } {
    const count = (this.messageCounts.get(conversationId) ?? 0) + 1;
    this.messageCounts.set(conversationId, count);

    if (count > this.limits.maxMessagesPerConversation) {
      return { allowed: false, reason: `Max ${this.limits.maxMessagesPerConversation} messages/conversation exceeded` };
    }

    return { allowed: true };
  }

  /** Reset conversation message count (on conversation end) */
  reset(conversationId: string): void {
    this.messageCounts.delete(conversationId);
  }
}
