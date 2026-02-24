import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact } from '../types';
import { logger } from '../../observability/logger';

type EscalationCause = 'frustration' | 'max_clarifications' | 'explicit_request' | 'bot_inability' | 'max_turns' | 'unknown';

/**
 * Escalation Pattern Analyzer
 *
 * Analyzes conversations that ended in ESCALATED state.
 * Classifies escalation causes, tracks rates by intent/channel,
 * and identifies "preventable" escalations.
 */
export class EscalationPatternAnalyzer implements ConversationAnalyzer {
  readonly name = 'escalation_pattern';
  private log = logger.child({ component: 'escalation-pattern-analyzer' });

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];
    const today = new Date().toISOString().slice(0, 10);

    const escalated = summaries.filter((s) => s.escalated);
    const resolved = summaries.filter((s) => s.resolvedByBot);
    const total = summaries.length;

    if (total === 0) return artifacts;

    // 1. Overall escalation rate
    const escalationRate = escalated.length / total;
    const resolutionRate = resolved.length / total;

    // 2. Classify escalation causes
    const causeDistribution = new Map<EscalationCause, number>();
    const intentEscalations = new Map<string, { total: number; escalated: number }>();
    const channelEscalations = new Map<string, { total: number; escalated: number }>();

    for (const summary of summaries) {
      // Track intent escalation rates
      const intentKey = summary.primaryIntent;
      const intentEntry = intentEscalations.get(intentKey) ?? { total: 0, escalated: 0 };
      intentEntry.total++;
      if (summary.escalated) intentEntry.escalated++;
      intentEscalations.set(intentKey, intentEntry);

      // Track channel escalation rates
      const channelEntry = channelEscalations.get(summary.channel) ?? { total: 0, escalated: 0 };
      channelEntry.total++;
      if (summary.escalated) channelEntry.escalated++;
      channelEscalations.set(summary.channel, channelEntry);

      // Classify cause if escalated
      if (summary.escalated) {
        const cause = this.classifyCause(summary);
        causeDistribution.set(cause, (causeDistribution.get(cause) ?? 0) + 1);
      }
    }

    // 3. Identify preventable escalations
    // An escalation is "preventable" if the same intent was resolved without escalation elsewhere
    const resolvedIntents = new Set(resolved.map((s) => s.primaryIntent));
    const preventable = escalated.filter((s) => resolvedIntents.has(s.primaryIntent));

    // 4. Build intent escalation report
    const intentReport = Array.from(intentEscalations.entries())
      .map(([intent, data]) => ({
        intent,
        total: data.total,
        escalated: data.escalated,
        rate: data.total > 0 ? data.escalated / data.total : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    // 5. Build cause report
    const causeReport = Array.from(causeDistribution.entries())
      .map(([cause, count]) => ({
        cause,
        count,
        percentage: escalated.length > 0 ? count / escalated.length : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Create main artifact
    artifacts.push({
      id: uuid(),
      type: 'escalation_pattern',
      data: {
        totalConversations: total,
        escalatedCount: escalated.length,
        resolvedCount: resolved.length,
        escalationRate,
        resolutionRate,
        preventableEscalations: preventable.length,
        preventableRate: escalated.length > 0 ? preventable.length / escalated.length : 0,
        causeDistribution: causeReport,
        intentEscalationRates: intentReport.slice(0, 15),
        channelEscalationRates: Array.from(channelEscalations.entries()).map(([ch, d]) => ({
          channel: ch,
          total: d.total,
          escalated: d.escalated,
          rate: d.total > 0 ? d.escalated / d.total : 0,
        })),
        topPreventableIntents: preventable
          .reduce((acc, s) => {
            acc.set(s.primaryIntent, (acc.get(s.primaryIntent) ?? 0) + 1);
            return acc;
          }, new Map<string, number>())
          .entries(),
      },
      createdAt: Date.now(),
      analysisDate: today,
      confidence: total >= 20 ? 0.8 : total >= 5 ? 0.5 : 0.3,
    });

    this.log.info({
      total,
      escalated: escalated.length,
      resolved: resolved.length,
      preventable: preventable.length,
      causes: causeReport.length,
    }, 'Escalation pattern analysis complete');

    return artifacts;
  }

  private classifyCause(summary: ConversationSummary): EscalationCause {
    const reason = (summary.escalationReason ?? '').toLowerCase();
    const lastUserMsg = (summary.userMessages[summary.userMessages.length - 1] ?? '').toLowerCase();

    // Explicit human request
    if (reason.includes('human') || reason.includes('agent') || reason.includes('manager') ||
        lastUserMsg.includes('human') || lastUserMsg.includes('real person') || lastUserMsg.includes('manager') ||
        lastUserMsg.includes('baat karo')) {
      return 'explicit_request';
    }

    // Frustration
    if (reason.includes('frustrat') || summary.satisfaction === 'negative') {
      return 'frustration';
    }

    // Max clarifications
    if (reason.includes('clarification') || summary.clarificationCount >= 3) {
      return 'max_clarifications';
    }

    // Max turns
    if (reason.includes('max_turns') || summary.turnCount >= 15) {
      return 'max_turns';
    }

    // Bot inability
    if (reason.includes('unable') || reason.includes('unavailable') || reason.includes('error')) {
      return 'bot_inability';
    }

    return 'unknown';
  }
}
