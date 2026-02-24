import { LearningStore } from './learning-store';
import { ConversationAnalyzer } from './analyzers/types';
import { PipelineResult } from './types';
import { learningArtifactsGenerated } from '../observability/metrics';
import { logger } from '../observability/logger';

/**
 * LearningPipeline orchestrates the analysis of conversation summaries.
 *
 * It fetches recent summaries from the learning store, runs each analyzer,
 * and persists the resulting artifacts. Individual analyzer failures are
 * caught and logged without blocking other analyzers.
 */
export class LearningPipeline {
  private log = logger.child({ component: 'learning-pipeline' });

  constructor(
    private readonly store: LearningStore,
    private readonly analyzers: ConversationAnalyzer[],
  ) {}

  /**
   * Run the full analysis pipeline on conversations from the given time window.
   * @param sincMs - Analyze conversations ended after this timestamp (default: last 24h)
   */
  async run(sinceMs?: number): Promise<PipelineResult> {
    const start = Date.now();
    const since = sinceMs ?? Date.now() - 24 * 60 * 60 * 1000;
    const today = new Date().toISOString().slice(0, 10);

    this.log.info({ since: new Date(since).toISOString() }, 'Learning pipeline starting');

    // 1. Fetch conversation summaries
    const summaries = await this.store.getSummaries(since);

    if (summaries.length === 0) {
      this.log.info('No conversation summaries found for analysis period');
      return {
        artifactCount: 0,
        faqCandidateCount: 0,
        summariesAnalyzed: 0,
        durationMs: Date.now() - start,
        analysisDate: today,
        analyzerResults: {},
      };
    }

    this.log.info({ summaryCount: summaries.length }, 'Summaries loaded for analysis');

    // 2. Run each analyzer (fault-tolerant)
    let totalArtifacts = 0;
    const analyzerResults: Record<string, { count: number; status: 'success' | 'error' }> = {};

    for (const analyzer of this.analyzers) {
      try {
        const artifacts = await analyzer.analyze(summaries);

        // Persist artifacts
        for (const artifact of artifacts) {
          await this.store.saveArtifact(artifact);
          learningArtifactsGenerated.inc({ type: artifact.type });
        }

        totalArtifacts += artifacts.length;
        analyzerResults[analyzer.name] = { count: artifacts.length, status: 'success' };

        this.log.info({
          analyzer: analyzer.name,
          artifactCount: artifacts.length,
        }, 'Analyzer completed');
      } catch (err) {
        analyzerResults[analyzer.name] = { count: 0, status: 'error' };
        this.log.error({ err, analyzer: analyzer.name }, 'Analyzer failed');
      }
    }

    // 3. Count FAQ candidates generated in this run
    const faqCandidates = await this.store.getFAQCandidates('pending');

    const result: PipelineResult = {
      artifactCount: totalArtifacts,
      faqCandidateCount: faqCandidates.length,
      summariesAnalyzed: summaries.length,
      durationMs: Date.now() - start,
      analysisDate: today,
      analyzerResults,
    };

    this.log.info({
      ...result,
    }, 'Learning pipeline completed');

    return result;
  }
}
