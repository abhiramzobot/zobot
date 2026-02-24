import { LearningPipeline } from './pipeline';
import { learningPipelineRuns, learningPipelineDuration } from '../observability/metrics';
import { logger } from '../observability/logger';

/**
 * LearningScheduler — runs the learning pipeline on a configurable interval.
 *
 * Uses simple setInterval (no external job queue needed).
 * The pipeline is idempotent, so re-runs after restarts are safe.
 */
export class LearningScheduler {
  private intervalHandle?: NodeJS.Timeout;
  private running = false;
  private log = logger.child({ component: 'learning-scheduler' });

  constructor(
    private readonly pipeline: LearningPipeline,
    private readonly intervalMs: number = 24 * 60 * 60 * 1000, // 24 hours
  ) {}

  /**
   * Start the scheduler. Runs the pipeline immediately, then at configured intervals.
   */
  start(): void {
    this.log.info({
      intervalHours: this.intervalMs / (60 * 60 * 1000),
    }, 'Learning scheduler started');

    // Run immediately for catch-up
    this.runPipeline().catch((err) =>
      this.log.error({ err }, 'Initial learning pipeline run failed'),
    );

    // Schedule recurring runs
    this.intervalHandle = setInterval(() => {
      this.runPipeline().catch((err) =>
        this.log.error({ err }, 'Scheduled learning pipeline run failed'),
      );
    }, this.intervalMs);
  }

  /**
   * Stop the scheduler gracefully.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.log.info('Learning scheduler stopped');
    }
  }

  /**
   * Trigger an ad-hoc pipeline run (e.g., from admin endpoint).
   */
  async triggerRun(): Promise<void> {
    return this.runPipeline();
  }

  /**
   * Check if the pipeline is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  private async runPipeline(): Promise<void> {
    if (this.running) {
      this.log.warn('Pipeline already running, skipping');
      return;
    }

    this.running = true;
    const start = Date.now();

    try {
      const result = await this.pipeline.run();

      learningPipelineRuns.inc({ status: 'success' });
      learningPipelineDuration.observe((Date.now() - start) / 1000);

      this.log.info({
        durationMs: result.durationMs,
        artifacts: result.artifactCount,
        faqCandidates: result.faqCandidateCount,
        summaries: result.summariesAnalyzed,
      }, 'Learning pipeline run completed');
    } catch (err) {
      learningPipelineRuns.inc({ status: 'error' });
      learningPipelineDuration.observe((Date.now() - start) / 1000);
      this.log.error({ err }, 'Learning pipeline run failed');
    } finally {
      this.running = false;
    }
  }
}
