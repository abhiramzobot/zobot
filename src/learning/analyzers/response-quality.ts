import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

/**
 * Response Quality Analyzer
 *
 * Uses implicit feedback signals to score response quality:
 * - Positive: RESOLVED, "thank you", low turn count
 * - Negative: ESCALATED, frustration keywords, abandoned
 *
 * Tracks quality per intent, per LLM provider/model, and per prompt version.
 */
export class ResponseQualityAnalyzer implements ConversationAnalyzer {
  readonly name = 'response_quality';
  private log = logger.child({ component: 'response-quality-analyzer' });

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];
    const today = new Date().toISOString().slice(0, 10);

    if (summaries.length === 0) return artifacts;

    // ── Per-Intent Quality ────────────────────────────────────────
    const intentMetrics = new Map<string, {
      total: number;
      resolved: number;
      escalated: number;
      totalTurns: number;
      positiveSatisfaction: number;
      negativeSatisfaction: number;
    }>();

    // ── Per-Provider Quality ──────────────────────────────────────
    const providerMetrics = new Map<string, {
      total: number;
      resolved: number;
      escalated: number;
      totalTurns: number;
    }>();

    // ── Per-Prompt-Version Quality ────────────────────────────────
    const promptMetrics = new Map<string, {
      total: number;
      resolved: number;
      escalated: number;
      totalTurns: number;
    }>();

    for (const summary of summaries) {
      // Intent metrics
      const intentKey = summary.primaryIntent;
      const intent = intentMetrics.get(intentKey) ?? {
        total: 0, resolved: 0, escalated: 0, totalTurns: 0,
        positiveSatisfaction: 0, negativeSatisfaction: 0,
      };
      intent.total++;
      intent.totalTurns += summary.turnCount;
      if (summary.resolvedByBot) intent.resolved++;
      if (summary.escalated) intent.escalated++;
      if (summary.satisfaction === 'positive') intent.positiveSatisfaction++;
      if (summary.satisfaction === 'negative') intent.negativeSatisfaction++;
      intentMetrics.set(intentKey, intent);

      // Provider metrics
      if (summary.llmProvider) {
        const providerKey = `${summary.llmProvider}/${summary.llmModel ?? 'unknown'}`;
        const provider = providerMetrics.get(providerKey) ?? {
          total: 0, resolved: 0, escalated: 0, totalTurns: 0,
        };
        provider.total++;
        provider.totalTurns += summary.turnCount;
        if (summary.resolvedByBot) provider.resolved++;
        if (summary.escalated) provider.escalated++;
        providerMetrics.set(providerKey, provider);
      }

      // Prompt version metrics
      if (summary.promptVersion) {
        const prompt = promptMetrics.get(summary.promptVersion) ?? {
          total: 0, resolved: 0, escalated: 0, totalTurns: 0,
        };
        prompt.total++;
        prompt.totalTurns += summary.turnCount;
        if (summary.resolvedByBot) prompt.resolved++;
        if (summary.escalated) prompt.escalated++;
        promptMetrics.set(summary.promptVersion, prompt);
      }
    }

    // Build intent quality report
    const intentReport = Array.from(intentMetrics.entries()).map(([intent, m]) => ({
      intent,
      total: m.total,
      resolutionRate: m.total > 0 ? m.resolved / m.total : 0,
      escalationRate: m.total > 0 ? m.escalated / m.total : 0,
      avgTurns: m.total > 0 ? m.totalTurns / m.total : 0,
      satisfactionScore: m.total > 0
        ? (m.positiveSatisfaction - m.negativeSatisfaction) / m.total
        : 0,
    })).sort((a, b) => b.total - a.total);

    // Build provider comparison report
    const providerReport = Array.from(providerMetrics.entries()).map(([key, m]) => {
      const [provider, model] = key.split('/');
      return {
        provider,
        model,
        total: m.total,
        resolutionRate: m.total > 0 ? m.resolved / m.total : 0,
        escalationRate: m.total > 0 ? m.escalated / m.total : 0,
        avgTurns: m.total > 0 ? m.totalTurns / m.total : 0,
      };
    });

    // Build prompt comparison report
    const promptReport = Array.from(promptMetrics.entries()).map(([version, m]) => ({
      version,
      total: m.total,
      resolutionRate: m.total > 0 ? m.resolved / m.total : 0,
      escalationRate: m.total > 0 ? m.escalated / m.total : 0,
      avgTurns: m.total > 0 ? m.totalTurns / m.total : 0,
    }));

    // Overall quality score
    const totalResolved = summaries.filter((s) => s.resolvedByBot).length;
    const overallResolutionRate = summaries.length > 0 ? totalResolved / summaries.length : 0;

    artifacts.push({
      id: uuid(),
      type: 'response_quality',
      data: {
        totalConversations: summaries.length,
        overallResolutionRate,
        overallEscalationRate: summaries.length > 0
          ? summaries.filter((s) => s.escalated).length / summaries.length
          : 0,
        avgTurnsToResolution: totalResolved > 0
          ? summaries.filter((s) => s.resolvedByBot).reduce((sum, s) => sum + s.turnCount, 0) / totalResolved
          : 0,
        intentQuality: intentReport.slice(0, 15),
        providerComparison: providerReport,
        promptVersionComparison: promptReport,
      },
      createdAt: Date.now(),
      analysisDate: today,
      confidence: summaries.length >= 50 ? 0.9 : summaries.length >= 10 ? 0.6 : 0.3,
    });

    this.log.info({
      totalConversations: summaries.length,
      overallResolutionRate: (overallResolutionRate * 100).toFixed(1) + '%',
      intentsAnalyzed: intentMetrics.size,
      providersAnalyzed: providerMetrics.size,
    }, 'Response quality analysis complete');

    return artifacts;
  }
}
