/**
 * Feedback Collector (Phase 3E)
 *
 * Captures agent actions post-escalation.
 */

import { AgentFeedback, FeedbackSummary } from './feedback-types';
import { logger } from '../observability/logger';

export class FeedbackCollector {
  private readonly feedbackStore: AgentFeedback[] = [];
  private readonly log = logger.child({ component: 'feedback-collector' });

  /** Record agent feedback */
  async collect(feedback: AgentFeedback): Promise<void> {
    this.feedbackStore.push(feedback);
    this.log.info({
      conversationId: feedback.conversationId,
      wasOverride: feedback.wasOverride,
      quality: feedback.suggestionQuality,
    }, 'Agent feedback collected');
  }

  /** Get feedback for a conversation */
  getForConversation(conversationId: string): AgentFeedback[] {
    return this.feedbackStore.filter((f) => f.conversationId === conversationId);
  }

  /** Generate feedback summary */
  getSummary(since: number, until: number = Date.now()): FeedbackSummary {
    const filtered = this.feedbackStore.filter((f) => f.timestamp >= since && f.timestamp <= until);

    const overrides = filtered.filter((f) => f.wasOverride);
    const overrideRate = filtered.length > 0 ? overrides.length / filtered.length : 0;

    const qualityRatings = filtered.filter((f) => f.suggestionQuality !== undefined);
    const avgQuality = qualityRatings.length > 0
      ? qualityRatings.reduce((sum, f) => sum + (f.suggestionQuality ?? 0), 0) / qualityRatings.length
      : 0;

    // Count override reasons
    const reasonCounts = new Map<string, number>();
    for (const f of overrides) {
      if (f.overrideReason) {
        reasonCounts.set(f.overrideReason, (reasonCounts.get(f.overrideReason) ?? 0) + 1);
      }
    }

    // Count knowledge gaps
    const gapCounts = new Map<string, number>();
    for (const f of filtered) {
      for (const gap of f.knowledgeGaps) {
        gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
      }
    }

    return {
      totalFeedback: filtered.length,
      overrideRate,
      avgSuggestionQuality: avgQuality,
      topOverrideReasons: Array.from(reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topKnowledgeGaps: Array.from(gapCounts.entries())
        .map(([gap, count]) => ({ gap, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      period: { since, until },
    };
  }
}
