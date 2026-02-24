import { ConversationSummary, LearningArtifact } from '../types';

/**
 * Common interface for all conversation analyzers.
 * Each analyzer examines a batch of conversation summaries and
 * produces learning artifacts.
 */
export interface ConversationAnalyzer {
  readonly name: string;

  /**
   * Analyze a batch of conversation summaries and return learning artifacts.
   * Implementations should be idempotent — analyzing the same data twice
   * should produce the same results.
   */
  analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]>;
}
