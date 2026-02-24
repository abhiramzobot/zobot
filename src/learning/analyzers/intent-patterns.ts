import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

/**
 * Intent Pattern Analyzer
 *
 * Clusters messages with 'unknown' or unhandled intents to discover
 * potential new intent categories. Tracks intent distribution shifts over time.
 */
export class IntentPatternAnalyzer implements ConversationAnalyzer {
  readonly name = 'intent_pattern';
  private log = logger.child({ component: 'intent-pattern-analyzer' });

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];
    const today = new Date().toISOString().slice(0, 10);

    if (summaries.length === 0) return artifacts;

    // 1. Build intent distribution
    const intentDistribution = new Map<string, number>();
    for (const summary of summaries) {
      for (const intent of summary.intents) {
        intentDistribution.set(intent, (intentDistribution.get(intent) ?? 0) + 1);
      }
    }

    // 2. Identify unknown/unhandled intent messages
    const unknownMessages: Array<{ text: string; conversationId: string }> = [];

    for (const summary of summaries) {
      if (summary.primaryIntent === 'unknown' || summary.primaryIntent === 'error_fallback') {
        for (const msg of summary.userMessages.slice(0, 2)) {
          if (msg.length > 5) {
            unknownMessages.push({
              text: msg.slice(0, 200),
              conversationId: summary.conversationId,
            });
          }
        }
      }
    }

    // 3. Cluster unknown messages by keyword similarity
    const clusters = this.clusterMessages(unknownMessages);

    // 4. Generate new intent candidates
    const intentCandidates = clusters
      .filter((c) => c.items.length >= 2)
      .map((c) => ({
        suggestedIntentName: this.suggestIntentName(c.keywords),
        exampleMessages: c.items.slice(0, 5).map((i) => i.text),
        frequency: c.items.length,
        keywords: c.keywords,
      }));

    // 5. Build distribution sorted by count
    const distributionSorted = Array.from(intentDistribution.entries())
      .map(([intent, count]) => ({ intent, count, percentage: count / summaries.length }))
      .sort((a, b) => b.count - a.count);

    artifacts.push({
      id: uuid(),
      type: 'intent_pattern',
      data: {
        totalConversations: summaries.length,
        intentDistribution: distributionSorted.slice(0, 20),
        unknownIntentCount: unknownMessages.length,
        unknownIntentRate: summaries.length > 0
          ? summaries.filter((s) => s.primaryIntent === 'unknown').length / summaries.length
          : 0,
        newIntentCandidates: intentCandidates.slice(0, 10),
        totalUniqueIntents: intentDistribution.size,
      },
      createdAt: Date.now(),
      analysisDate: today,
      confidence: summaries.length >= 30 ? 0.7 : summaries.length >= 10 ? 0.4 : 0.2,
    });

    this.log.info({
      totalIntents: intentDistribution.size,
      unknownMessages: unknownMessages.length,
      newCandidates: intentCandidates.length,
    }, 'Intent pattern analysis complete');

    return artifacts;
  }

  private clusterMessages(
    messages: Array<{ text: string; conversationId: string }>,
  ): Array<{ items: typeof messages; keywords: string[] }> {
    const clusters: Array<{ items: typeof messages; keywords: string[] }> = [];
    const assigned = new Set<number>();

    for (let i = 0; i < messages.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [messages[i]];
      assigned.add(i);
      const keywordsA = this.extractKeywords(messages[i].text);

      for (let j = i + 1; j < messages.length; j++) {
        if (assigned.has(j)) continue;
        const keywordsB = this.extractKeywords(messages[j].text);

        if (this.keywordOverlap(keywordsA, keywordsB) >= 0.3) {
          cluster.push(messages[j]);
          assigned.add(j);
        }
      }

      clusters.push({ items: cluster, keywords: keywordsA });
    }

    return clusters.sort((a, b) => b.items.length - a.items.length);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'i', 'me', 'my', 'we', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'have', 'has',
      'do', 'does', 'did', 'will', 'would', 'should', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'and', 'but', 'or', 'not', 'this', 'that', 'it', 'you', 'your',
      'hi', 'hello', 'please', 'want', 'need', 'help', 'can',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  private keywordOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setB = new Set(b);
    const intersection = a.filter((w) => setB.has(w)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 ? intersection / union : 0;
  }

  private suggestIntentName(keywords: string[]): string {
    if (keywords.length === 0) return 'unknown_cluster';
    return keywords.slice(0, 3).join('_');
  }
}
