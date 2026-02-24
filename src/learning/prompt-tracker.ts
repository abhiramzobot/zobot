import { ConversationSummary } from './types';
import { LearningStore } from './learning-store';
import { botResolutionRate } from '../observability/metrics';
import { logger } from '../observability/logger';

export interface PromptEffectivenessReport {
  promptVersion: string;
  totalConversations: number;
  resolutionRate: number;
  escalationRate: number;
  avgTurnsToResolution: number;
  avgClarifications: number;
  intentAccuracy: number; // % of intents that were not 'unknown'
}

export interface ProviderComparisonReport {
  provider: string;
  model: string;
  totalConversations: number;
  resolutionRate: number;
  escalationRate: number;
  avgTurnsToResolution: number;
}

/**
 * PromptTracker — tracks prompt version and LLM provider effectiveness.
 *
 * Cross-references promptVersion and provider info in ConversationSummary
 * with resolution/escalation outcomes to generate comparison reports.
 */
export class PromptTracker {
  private log = logger.child({ component: 'prompt-tracker' });

  constructor(private readonly store: LearningStore) {}

  /**
   * Generate prompt effectiveness report for the given time window.
   */
  async getPromptReport(sinceMs?: number): Promise<PromptEffectivenessReport[]> {
    const since = sinceMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000; // Last 7 days
    const summaries = await this.store.getSummaries(since);

    const versionMap = new Map<string, ConversationSummary[]>();

    for (const summary of summaries) {
      const version = summary.promptVersion ?? 'unknown';
      const existing = versionMap.get(version) ?? [];
      existing.push(summary);
      versionMap.set(version, existing);
    }

    const reports: PromptEffectivenessReport[] = [];

    for (const [version, batch] of versionMap) {
      const resolved = batch.filter((s) => s.resolvedByBot);
      const escalated = batch.filter((s) => s.escalated);
      const totalIntents = batch.reduce((sum, s) => sum + s.intents.length, 0);
      const unknownIntents = batch.reduce(
        (sum, s) => sum + s.intents.filter((i) => i === 'unknown' || i === 'error_fallback').length,
        0,
      );

      const report: PromptEffectivenessReport = {
        promptVersion: version,
        totalConversations: batch.length,
        resolutionRate: batch.length > 0 ? resolved.length / batch.length : 0,
        escalationRate: batch.length > 0 ? escalated.length / batch.length : 0,
        avgTurnsToResolution: resolved.length > 0
          ? resolved.reduce((sum, s) => sum + s.turnCount, 0) / resolved.length
          : 0,
        avgClarifications: batch.length > 0
          ? batch.reduce((sum, s) => sum + s.clarificationCount, 0) / batch.length
          : 0,
        intentAccuracy: totalIntents > 0 ? 1 - (unknownIntents / totalIntents) : 0,
      };

      reports.push(report);

      // Update Prometheus gauge
      botResolutionRate.set(
        { provider: 'all', model: 'all', prompt_version: version },
        report.resolutionRate,
      );
    }

    return reports.sort((a, b) => b.totalConversations - a.totalConversations);
  }

  /**
   * Generate LLM provider comparison report.
   */
  async getProviderReport(sinceMs?: number): Promise<ProviderComparisonReport[]> {
    const since = sinceMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const summaries = await this.store.getSummaries(since);

    const providerMap = new Map<string, ConversationSummary[]>();

    for (const summary of summaries) {
      if (!summary.llmProvider) continue;
      const key = `${summary.llmProvider}/${summary.llmModel ?? 'unknown'}`;
      const existing = providerMap.get(key) ?? [];
      existing.push(summary);
      providerMap.set(key, existing);
    }

    const reports: ProviderComparisonReport[] = [];

    for (const [key, batch] of providerMap) {
      const [provider, model] = key.split('/');
      const resolved = batch.filter((s) => s.resolvedByBot);
      const escalated = batch.filter((s) => s.escalated);

      reports.push({
        provider,
        model,
        totalConversations: batch.length,
        resolutionRate: batch.length > 0 ? resolved.length / batch.length : 0,
        escalationRate: batch.length > 0 ? escalated.length / batch.length : 0,
        avgTurnsToResolution: resolved.length > 0
          ? resolved.reduce((sum, s) => sum + s.turnCount, 0) / resolved.length
          : 0,
      });

      // Update Prometheus gauge
      botResolutionRate.set(
        { provider, model, prompt_version: 'all' },
        batch.length > 0 ? resolved.length / batch.length : 0,
      );
    }

    return reports.sort((a, b) => b.totalConversations - a.totalConversations);
  }
}
