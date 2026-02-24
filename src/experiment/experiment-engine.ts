/**
 * Experiment Engine (Phase 3C)
 *
 * Hash-based assignment, auto-stop on degradation.
 */

import { createHash } from 'crypto';
import { Experiment, ExperimentVariant, ExperimentAssignment } from './types';
import { logger } from '../observability/logger';

export class ExperimentEngine {
  private readonly experiments = new Map<string, Experiment>();
  private readonly assignments = new Map<string, ExperimentAssignment>();
  private readonly log = logger.child({ component: 'experiment-engine' });

  /** Create a new experiment */
  create(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
    this.log.info({ id: experiment.id, name: experiment.name }, 'Experiment created');
  }

  /** Start an experiment */
  start(experimentId: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status === 'running') return false;
    exp.status = 'running';
    exp.startedAt = Date.now();
    return true;
  }

  /** Stop an experiment */
  stop(experimentId: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp) return false;
    exp.status = 'stopped';
    exp.endedAt = Date.now();
    return true;
  }

  /** Assign a conversation to a variant using consistent hashing */
  assign(conversationId: string): ExperimentAssignment | null {
    // Find first running experiment
    const running = Array.from(this.experiments.values()).find((e) => e.status === 'running');
    if (!running) return null;

    // Check if already assigned
    const existing = this.assignments.get(conversationId);
    if (existing && existing.experimentId === running.id) return existing;

    // Hash-based assignment for consistency
    const hash = createHash('md5').update(`${running.id}:${conversationId}`).digest();
    const bucket = hash.readUInt32BE(0) % 100;

    let cumWeight = 0;
    let selectedVariant: ExperimentVariant | undefined;
    for (const variant of running.variants) {
      cumWeight += variant.weight;
      if (bucket < cumWeight) {
        selectedVariant = variant;
        break;
      }
    }

    if (!selectedVariant) selectedVariant = running.variants[0];

    const assignment: ExperimentAssignment = {
      experimentId: running.id,
      variantId: selectedVariant.id,
      conversationId,
      assignedAt: Date.now(),
    };

    this.assignments.set(conversationId, assignment);
    selectedVariant.metrics.conversationCount++;

    return assignment;
  }

  /** Get variant overrides for a conversation */
  getOverrides(conversationId: string): Record<string, unknown> | null {
    const assignment = this.assignments.get(conversationId);
    if (!assignment) return null;

    const exp = this.experiments.get(assignment.experimentId);
    if (!exp || exp.status !== 'running') return null;

    const variant = exp.variants.find((v) => v.id === assignment.variantId);
    return variant?.overrides ?? null;
  }

  /** Get all experiments */
  getAll(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /** Get experiment by ID */
  get(id: string): Experiment | undefined {
    return this.experiments.get(id);
  }

  /** Check for degradation and auto-stop */
  checkDegradation(experimentId: string): boolean {
    const exp = this.experiments.get(experimentId);
    if (!exp || !exp.autoStopOnDegradation) return false;

    const control = exp.variants[0];
    for (const variant of exp.variants.slice(1)) {
      if (variant.metrics.conversationCount < 10) continue;
      const csatDrop = (control.metrics.avgCsat - variant.metrics.avgCsat) / control.metrics.avgCsat;
      if (csatDrop > exp.degradationThreshold / 100) {
        this.stop(experimentId);
        this.log.warn({ experimentId, variant: variant.id, csatDrop }, 'Experiment auto-stopped due to degradation');
        return true;
      }
    }
    return false;
  }
}
