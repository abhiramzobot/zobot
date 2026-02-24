/**
 * A/B Testing Types (Phase 3C)
 */

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'stopped';

export interface ExperimentVariant {
  id: string;
  name: string;
  /** Weight percentage (all variants should sum to 100) */
  weight: number;
  /** Override config (prompt version, model, etc.) */
  overrides: Record<string, unknown>;
  /** Metrics collected */
  metrics: {
    conversationCount: number;
    resolutionRate: number;
    avgCsat: number;
    avgTurns: number;
    escalationRate: number;
  };
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  /** Auto-stop if degradation detected */
  autoStopOnDegradation: boolean;
  /** Degradation threshold (e.g., 20% drop in CSAT) */
  degradationThreshold: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  conversationId: string;
  assignedAt: number;
}
