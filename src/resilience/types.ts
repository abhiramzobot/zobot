/**
 * Graceful Degradation Types (Phase 1C)
 */

export type DependencyName = 'redis' | 'oms' | 'tracking' | 'ticketing' | 'llm' | 'search' | 'payment';

export type DependencyStatus = 'healthy' | 'degraded' | 'down';

export type DegradationLevel = 'none' | 'partial' | 'full';

export interface DependencyHealth {
  name: DependencyName;
  status: DependencyStatus;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: string;
  /** Circuit breaker: open = requests blocked */
  circuitOpen: boolean;
  circuitOpenUntil?: number;
}

export interface FallbackConfig {
  /** Intent → static response mapping */
  staticResponses: Map<string, string>;
  /** Default fallback message */
  defaultMessage: string;
  /** Max consecutive failures before opening circuit */
  failureThreshold: number;
  /** Circuit open duration in ms */
  circuitResetMs: number;
}

export interface IncidentSeverity {
  level: 1 | 2 | 3 | 4;
  label: 'Critical' | 'High' | 'Medium' | 'Low';
}

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  trigger: string;
  status: 'open' | 'investigating' | 'mitigating' | 'resolved';
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  affectedDependencies: DependencyName[];
  timeline: Array<{ timestamp: number; action: string; actor: string }>;
}
