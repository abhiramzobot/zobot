/**
 * Conversation Summarizer (Enhancement v5 — B2)
 *
 * Auto-generates concise summaries for agent handoff and ticket notes.
 * Extracts: summary, key issues, actions attempted, sentiment, recommendation.
 */

import { logger } from '../observability/logger';

const log = logger.child({ component: 'summarizer' });

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  toolCalls?: Array<{ name: string; result?: string }>;
}

export interface ConversationSummary {
  /** 2-3 sentence summary of the conversation */
  summary: string;
  /** Key issues identified */
  keyIssues: string[];
  /** Actions attempted by the bot */
  actionsAttempted: string[];
  /** Overall customer sentiment */
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'mixed';
  /** Recommended next action for the agent */
  recommendedAction: string;
  /** Duration of conversation */
  messageCount: number;
  /** Tools used during conversation */
  toolsUsed: string[];
}

export class ConversationSummarizer {
  /**
   * Generate a summary from conversation messages.
   * Uses heuristic extraction (no LLM call) for speed.
   * In production, this can be enhanced with an LLM call for richer summaries.
   */
  summarize(messages: ConversationMessage[]): ConversationSummary {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    // Extract key issues from user messages
    const keyIssues = this.extractKeyIssues(userMessages);

    // Extract tools used
    const toolsUsed = this.extractToolsUsed(messages);

    // Extract actions attempted
    const actionsAttempted = this.extractActions(assistantMessages, toolsUsed);

    // Detect sentiment
    const customerSentiment = this.detectSentiment(userMessages);

    // Build summary
    const summary = this.buildSummary(userMessages, keyIssues, toolsUsed);

    // Recommend next action
    const recommendedAction = this.recommendAction(keyIssues, toolsUsed, customerSentiment);

    const result: ConversationSummary = {
      summary,
      keyIssues,
      actionsAttempted,
      customerSentiment,
      recommendedAction,
      messageCount: messages.length,
      toolsUsed,
    };

    log.info({
      messageCount: messages.length,
      keyIssueCount: keyIssues.length,
      sentiment: customerSentiment,
    }, 'Conversation summarized');

    return result;
  }

  /**
   * Generate a summary prompt for LLM-based summarization.
   * Used when richer summaries are needed (e.g., escalation to human).
   */
  buildSummaryPrompt(messages: ConversationMessage[]): string {
    const transcript = messages
      .map((m) => {
        const role = m.role === 'user' ? 'Customer' : m.role === 'assistant' ? 'Bot' : 'System';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    return [
      'Summarize this customer service conversation for an agent handoff. Provide:',
      '',
      '1. **Summary** (2-3 sentences): What the customer needed and what happened',
      '2. **Key Issues** (bullet points): Main problems or requests',
      '3. **Actions Taken** (bullet points): What the bot tried to do',
      '4. **Customer Sentiment**: positive, neutral, negative, or frustrated',
      '5. **Recommended Next Step**: What the human agent should do first',
      '',
      '--- CONVERSATION ---',
      transcript,
      '--- END ---',
    ].join('\n');
  }

  // ───── Private Helpers ─────────────────────────────────

  private extractKeyIssues(userMessages: ConversationMessage[]): string[] {
    const issues: string[] = [];
    const issuePatterns = [
      { pattern: /refund|money back|return/i, issue: 'Refund/return request' },
      { pattern: /cancel/i, issue: 'Order cancellation' },
      { pattern: /track|where is|shipping|delivery/i, issue: 'Order tracking/delivery inquiry' },
      { pattern: /damage|broken|defect/i, issue: 'Damaged/defective product' },
      { pattern: /wrong|incorrect|mistake/i, issue: 'Wrong item received' },
      { pattern: /missing|not received/i, issue: 'Missing item/order' },
      { pattern: /price|discount|coupon/i, issue: 'Pricing/discount inquiry' },
      { pattern: /complaint|unhappy|disappointed/i, issue: 'Customer complaint' },
      { pattern: /help|support|issue|problem/i, issue: 'General support request' },
      { pattern: /product.*info|tell me about|looking for/i, issue: 'Product information request' },
      { pattern: /bulk|wholesale|quote/i, issue: 'Bulk/B2B inquiry' },
      { pattern: /payment|pay|transaction/i, issue: 'Payment issue' },
    ];

    for (const msg of userMessages) {
      for (const { pattern, issue } of issuePatterns) {
        if (pattern.test(msg.content) && !issues.includes(issue)) {
          issues.push(issue);
        }
      }
    }

    return issues.length > 0 ? issues : ['General inquiry'];
  }

  private extractToolsUsed(messages: ConversationMessage[]): string[] {
    const tools = new Set<string>();
    for (const msg of messages) {
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          tools.add(tc.name);
        }
      }
    }
    return Array.from(tools);
  }

  private extractActions(
    assistantMessages: ConversationMessage[],
    toolsUsed: string[],
  ): string[] {
    const actions: string[] = [];
    const toolActions: Record<string, string> = {
      lookup_customer_orders: 'Looked up customer orders',
      track_shipment: 'Tracked shipment status',
      search_products: 'Searched products',
      cancel_order: 'Attempted order cancellation',
      initiate_refund: 'Initiated refund process',
      apply_coupon: 'Applied coupon code',
      check_coupon: 'Checked coupon eligibility',
      add_to_cart: 'Added product to cart',
      view_cart: 'Showed cart contents',
      recommend_products: 'Provided product recommendations',
      analyze_image: 'Analyzed uploaded image',
      handoff_to_human: 'Escalated to human agent',
      start_ar_demo: 'Started AR demo session',
    };

    for (const tool of toolsUsed) {
      if (toolActions[tool]) {
        actions.push(toolActions[tool]);
      }
    }

    if (actions.length === 0) {
      actions.push('Provided conversational support');
    }

    return actions;
  }

  private detectSentiment(
    userMessages: ConversationMessage[],
  ): 'positive' | 'neutral' | 'negative' | 'frustrated' | 'mixed' {
    let positive = 0;
    let negative = 0;

    const positivePatterns = /thank|great|excellent|perfect|awesome|good|happy|love|amazing/i;
    const negativePatterns = /angry|terrible|horrible|worst|awful|hate|useless|scam|fraud|disappointed|frustrated|annoyed|ridiculous/i;

    for (const msg of userMessages) {
      if (positivePatterns.test(msg.content)) positive++;
      if (negativePatterns.test(msg.content)) negative++;
    }

    if (positive > 0 && negative > 0) return 'mixed';
    if (negative >= 3) return 'frustrated';
    if (negative > 0) return 'negative';
    if (positive > 0) return 'positive';
    return 'neutral';
  }

  private buildSummary(
    userMessages: ConversationMessage[],
    keyIssues: string[],
    toolsUsed: string[],
  ): string {
    const issueText = keyIssues.join(', ').toLowerCase();
    const firstMsg = userMessages[0]?.content?.substring(0, 100) || 'general inquiry';
    const msgCount = userMessages.length;

    let summary = `Customer reached out regarding ${issueText}.`;

    if (toolsUsed.length > 0) {
      summary += ` Bot attempted ${toolsUsed.length} action(s) including ${toolsUsed.slice(0, 3).join(', ')}.`;
    }

    if (msgCount > 5) {
      summary += ` Extended conversation with ${msgCount} customer messages.`;
    }

    return summary;
  }

  private recommendAction(
    keyIssues: string[],
    toolsUsed: string[],
    sentiment: string,
  ): string {
    if (sentiment === 'frustrated') {
      return 'Priority: Acknowledge customer frustration and offer immediate resolution.';
    }

    if (keyIssues.includes('Refund/return request')) {
      return 'Review refund request and process accordingly.';
    }

    if (keyIssues.includes('Damaged/defective product')) {
      return 'Verify damage claim and arrange replacement/refund.';
    }

    if (keyIssues.includes('Wrong item received')) {
      return 'Arrange correct item dispatch and return pickup for wrong item.';
    }

    if (toolsUsed.includes('handoff_to_human')) {
      return 'Customer was escalated — review conversation context and assist.';
    }

    return 'Review conversation context and assist with pending issues.';
  }
}

// ───── Singleton ───────────────────────────────────────────

let summarizer: ConversationSummarizer | null = null;

export function initSummarizer(): ConversationSummarizer {
  summarizer = new ConversationSummarizer();
  return summarizer;
}

export function getSummarizer(): ConversationSummarizer | null {
  return summarizer;
}
