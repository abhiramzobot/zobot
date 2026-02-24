/**
 * Sentiment Trend Analyzer (Phase 4)
 *
 * Analyzes sentiment distribution over time windows.
 * Detects degradation trends and correlates sentiment with intents/channels.
 */

import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

export class SentimentTrendAnalyzer implements ConversationAnalyzer {
  readonly name = 'sentiment_trend';

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];

    if (summaries.length < 5) return artifacts;

    // Sentiment distribution
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    const sentimentByIntent = new Map<string, { total: number; negative: number }>();
    let totalWithSentiment = 0;

    for (const summary of summaries) {
      const score = summary.avgSentimentScore;
      if (score === undefined) continue;
      totalWithSentiment++;

      if (score > 0.2) sentimentCounts.positive++;
      else if (score < -0.2) sentimentCounts.negative++;
      else sentimentCounts.neutral++;

      // Track by intent
      const intent = summary.primaryIntent ?? 'unknown';
      const entry = sentimentByIntent.get(intent) ?? { total: 0, negative: 0 };
      entry.total++;
      if (score < -0.2) entry.negative++;
      sentimentByIntent.set(intent, entry);
    }

    if (totalWithSentiment === 0) return artifacts;

    // Detect negative sentiment spike
    const negativeRate = sentimentCounts.negative / totalWithSentiment;

    // Find intents with highest negative sentiment rate
    const problemIntents: Array<{ intent: string; negativeRate: number; count: number }> = [];
    for (const [intent, data] of sentimentByIntent) {
      if (data.total >= 3) {
        const rate = data.negative / data.total;
        if (rate > 0.3) {
          problemIntents.push({ intent, negativeRate: rate, count: data.total });
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    artifacts.push({
      id: uuid(),
      type: 'sentiment_trend',
      data: {
        period: {
          from: Math.min(...summaries.map((s) => s.startedAt)),
          to: Math.max(...summaries.map((s) => s.endedAt ?? s.startedAt)),
        },
        distribution: sentimentCounts,
        totalConversations: totalWithSentiment,
        overallNegativeRate: Math.round(negativeRate * 100) / 100,
        problemIntents: problemIntents.sort((a, b) => b.negativeRate - a.negativeRate),
        alert: negativeRate > 0.4 ? 'HIGH_NEGATIVE_SENTIMENT' : undefined,
      },
      createdAt: Date.now(),
      analysisDate: today,
      confidence: Math.min(0.95, totalWithSentiment / 50),
    });

    if (negativeRate > 0.4) {
      logger.warn({ negativeRate, totalWithSentiment }, 'Sentiment trend: high negative rate detected');
    }

    return artifacts;
  }
}
