/**
 * VOC Quality Analyzer (Phase 4)
 *
 * Measures VOC pipeline quality metrics:
 * - Average confidence scores
 * - Clarification rates
 * - FCR (First Contact Resolution) rate
 * - Cross-language comparison
 * - Low-confidence intent identification
 */

import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

export class VOCQualityAnalyzer implements ConversationAnalyzer {
  readonly name = 'voc_quality';

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];

    if (summaries.length < 5) return artifacts;

    // Confidence analysis
    let totalConfidence = 0;
    let confidenceCount = 0;
    const confidenceByIntent = new Map<string, { total: number; count: number }>();

    // FCR tracking
    let fcrCount = 0;
    let fcrEligible = 0;

    // Clarification analysis
    let totalClarifications = 0;
    let conversationsWithClarification = 0;

    // Language distribution
    const languageCounts = new Map<string, number>();

    // Urgency distribution
    const urgencyCounts = new Map<string, number>();

    // Risk flag tracking
    const riskFlagCounts = new Map<string, number>();

    for (const summary of summaries) {
      // Confidence
      if (summary.avgConfidenceScore !== undefined) {
        totalConfidence += summary.avgConfidenceScore;
        confidenceCount++;

        const intent = summary.primaryIntent ?? 'unknown';
        const entry = confidenceByIntent.get(intent) ?? { total: 0, count: 0 };
        entry.total += summary.avgConfidenceScore;
        entry.count++;
        confidenceByIntent.set(intent, entry);
      }

      // FCR
      if (summary.resolvedWithoutEscalation !== undefined) {
        fcrEligible++;
        if (summary.fcrAchieved === true) {
          fcrCount++;
        }
      }

      // Clarifications
      if (summary.clarificationCount > 0) {
        conversationsWithClarification++;
        totalClarifications += summary.clarificationCount;
      }

      // Languages
      if (summary.detectedLanguages) {
        for (const lang of summary.detectedLanguages) {
          languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
        }
      }

      // Urgency
      if (summary.urgencyPeakLevel) {
        urgencyCounts.set(summary.urgencyPeakLevel, (urgencyCounts.get(summary.urgencyPeakLevel) ?? 0) + 1);
      }

      // Risk flags
      if (summary.riskFlagsDetected) {
        for (const flag of summary.riskFlagsDetected) {
          riskFlagCounts.set(flag, (riskFlagCounts.get(flag) ?? 0) + 1);
        }
      }
    }

    // Build avg confidence by intent
    const avgConfidenceByIntent: Array<{ intent: string; avgConfidence: number; count: number }> = [];
    for (const [intent, data] of confidenceByIntent) {
      avgConfidenceByIntent.push({
        intent,
        avgConfidence: Math.round((data.total / data.count) * 100) / 100,
        count: data.count,
      });
    }

    // Find low-confidence intents
    const lowConfidenceIntents = avgConfidenceByIntent
      .filter((i) => i.avgConfidence < 0.6 && i.count >= 3)
      .sort((a, b) => a.avgConfidence - b.avgConfidence);

    const fcrRate = fcrEligible > 0 ? Math.round((fcrCount / fcrEligible) * 100) / 100 : 0;
    const clarificationRate = summaries.length > 0
      ? Math.round((conversationsWithClarification / summaries.length) * 100) / 100
      : 0;

    const today = new Date().toISOString().slice(0, 10);

    artifacts.push({
      id: uuid(),
      type: 'voc_quality',
      data: {
        period: {
          from: Math.min(...summaries.map((s) => s.startedAt)),
          to: Math.max(...summaries.map((s) => s.endedAt ?? s.startedAt)),
        },
        totalConversations: summaries.length,
        avgConfidence: confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) / 100 : null,
        avgConfidenceByIntent: avgConfidenceByIntent.sort((a, b) => b.count - a.count),
        lowConfidenceIntents,
        firstContactResolutionRate: fcrRate,
        clarificationRate,
        avgClarificationsPerConversation: summaries.length > 0
          ? Math.round((totalClarifications / summaries.length) * 100) / 100
          : 0,
        languageDistribution: Object.fromEntries(languageCounts),
        urgencyDistribution: Object.fromEntries(urgencyCounts),
        riskFlagFrequency: Object.fromEntries(riskFlagCounts),
      },
      createdAt: Date.now(),
      analysisDate: today,
      confidence: Math.min(0.9, summaries.length / 100),
    });

    if (lowConfidenceIntents.length > 0) {
      logger.info({ lowConfidenceIntents }, 'VOC quality: low-confidence intents identified');
    }

    return artifacts;
  }
}
