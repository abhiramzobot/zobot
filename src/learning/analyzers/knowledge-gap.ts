import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

/**
 * Knowledge Gap Detection Analyzer
 *
 * Identifies user queries where the knowledge base returned no results,
 * correlates gaps with escalation outcomes, and prioritizes by
 * frequency and escalation rate.
 */
export class KnowledgeGapAnalyzer implements ConversationAnalyzer {
  readonly name = 'knowledge_gap';
  private log = logger.child({ component: 'knowledge-gap-analyzer' });

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // 1. Collect all knowledge gaps across conversations
    const gapMap = new Map<string, {
      query: string;
      count: number;
      escalatedCount: number;
      conversationIds: string[];
    }>();

    for (const summary of summaries) {
      for (const gap of summary.knowledgeGaps) {
        const normalized = gap.toLowerCase().trim();
        if (!normalized) continue;

        const existing = gapMap.get(normalized);
        if (existing) {
          existing.count++;
          existing.conversationIds.push(summary.conversationId);
          if (summary.escalated) existing.escalatedCount++;
        } else {
          gapMap.set(normalized, {
            query: gap,
            count: 1,
            escalatedCount: summary.escalated ? 1 : 0,
            conversationIds: [summary.conversationId],
          });
        }
      }

      // Also check user messages for patterns that indicate knowledge gaps
      // (e.g., bot responded with clarification/unknown intent)
      if (summary.primaryIntent === 'unknown' || summary.primaryIntent === 'clarification_request') {
        for (const msg of summary.userMessages.slice(0, 2)) {
          const normalized = msg.toLowerCase().trim().slice(0, 100);
          if (!normalized || normalized.length < 5) continue;

          const existing = gapMap.get(normalized);
          if (existing) {
            existing.count++;
            if (!existing.conversationIds.includes(summary.conversationId)) {
              existing.conversationIds.push(summary.conversationId);
            }
            if (summary.escalated) existing.escalatedCount++;
          } else {
            gapMap.set(normalized, {
              query: msg.slice(0, 100),
              count: 1,
              escalatedCount: summary.escalated ? 1 : 0,
              conversationIds: [summary.conversationId],
            });
          }
        }
      }
    }

    // 2. Sort by frequency × escalation rate (priority score)
    const sortedGaps = Array.from(gapMap.values())
      .filter((g) => g.count >= 2) // At least 2 occurrences
      .sort((a, b) => {
        const scoreA = a.count * (1 + a.escalatedCount / a.count);
        const scoreB = b.count * (1 + b.escalatedCount / b.count);
        return scoreB - scoreA;
      })
      .slice(0, 20); // Top 20 gaps

    // 3. Create artifacts
    for (const gap of sortedGaps) {
      const escalationRate = gap.count > 0 ? gap.escalatedCount / gap.count : 0;

      artifacts.push({
        id: uuid(),
        type: 'knowledge_gap',
        data: {
          query: gap.query,
          frequency: gap.count,
          escalationRate,
          escalatedCount: gap.escalatedCount,
          conversationIds: gap.conversationIds.slice(0, 10),
          suggestedCategory: this.suggestCategory(gap.query),
        },
        createdAt: Date.now(),
        analysisDate: today,
        confidence: Math.min(0.9, gap.count / 10),
      });
    }

    this.log.info({
      totalGaps: gapMap.size,
      significantGaps: sortedGaps.length,
      artifactsGenerated: artifacts.length,
    }, 'Knowledge gap analysis complete');

    return artifacts;
  }

  private suggestCategory(query: string): string {
    const lower = query.toLowerCase();
    if (lower.includes('order') || lower.includes('track')) return 'order_management';
    if (lower.includes('return') || lower.includes('refund')) return 'returns';
    if (lower.includes('product') || lower.includes('price')) return 'product_info';
    if (lower.includes('warranty') || lower.includes('repair')) return 'warranty';
    if (lower.includes('payment') || lower.includes('pay')) return 'payments';
    if (lower.includes('delivery') || lower.includes('ship')) return 'shipping';
    return 'general';
  }
}
