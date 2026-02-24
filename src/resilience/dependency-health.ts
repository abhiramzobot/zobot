/**
 * Dependency Health Manager (Phase 1C)
 *
 * Per-dependency circuit breakers + health monitoring.
 */

import { DependencyName, DependencyHealth, DependencyStatus, DegradationLevel } from './types';
import { logger } from '../observability/logger';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_CIRCUIT_RESET_MS = 30_000;

export class DependencyHealthManager {
  private readonly deps = new Map<DependencyName, DependencyHealth>();
  private readonly log = logger.child({ component: 'dep-health' });

  constructor(
    private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    private readonly circuitResetMs = DEFAULT_CIRCUIT_RESET_MS,
  ) {
    // Initialize all dependencies
    const names: DependencyName[] = ['redis', 'oms', 'tracking', 'ticketing', 'llm', 'search', 'payment'];
    for (const name of names) {
      this.deps.set(name, {
        name,
        status: 'healthy',
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        circuitOpen: false,
      });
    }
  }

  /** Record a successful call */
  recordSuccess(name: DependencyName): void {
    const dep = this.deps.get(name);
    if (!dep) return;
    dep.consecutiveFailures = 0;
    dep.status = 'healthy';
    dep.lastCheck = Date.now();
    dep.circuitOpen = false;
    dep.lastError = undefined;
  }

  /** Record a failed call */
  recordFailure(name: DependencyName, error: string): void {
    const dep = this.deps.get(name);
    if (!dep) return;
    dep.consecutiveFailures++;
    dep.lastCheck = Date.now();
    dep.lastError = error;

    if (dep.consecutiveFailures >= this.failureThreshold) {
      dep.status = 'down';
      dep.circuitOpen = true;
      dep.circuitOpenUntil = Date.now() + this.circuitResetMs;
      this.log.warn({ dependency: name, failures: dep.consecutiveFailures }, 'Circuit opened');
    } else if (dep.consecutiveFailures >= Math.floor(this.failureThreshold / 2)) {
      dep.status = 'degraded';
    }
  }

  /** Check if a dependency is available (circuit closed or half-open) */
  isAvailable(name: DependencyName): boolean {
    const dep = this.deps.get(name);
    if (!dep) return true;

    if (!dep.circuitOpen) return true;

    // Check if circuit should half-open
    if (dep.circuitOpenUntil && Date.now() > dep.circuitOpenUntil) {
      dep.circuitOpen = false;
      dep.status = 'degraded';
      return true; // Allow one probe request
    }

    return false;
  }

  /** Get status of a specific dependency */
  getStatus(name: DependencyName): DependencyHealth | undefined {
    return this.deps.get(name);
  }

  /** Get all dependency statuses */
  getAllStatuses(): DependencyHealth[] {
    return Array.from(this.deps.values());
  }

  /** Get overall degradation level */
  getDegradationLevel(): DegradationLevel {
    const statuses = this.getAllStatuses();
    const downCount = statuses.filter((d) => d.status === 'down').length;
    const degradedCount = statuses.filter((d) => d.status === 'degraded').length;

    if (downCount >= 3) return 'full';
    if (downCount > 0 || degradedCount >= 2) return 'partial';
    return 'none';
  }

  /** Get health summary for /ready endpoint */
  getHealthSummary(): Record<string, { status: DependencyStatus; circuitOpen: boolean; failures: number }> {
    const summary: Record<string, { status: DependencyStatus; circuitOpen: boolean; failures: number }> = {};
    for (const dep of this.deps.values()) {
      summary[dep.name] = {
        status: dep.status,
        circuitOpen: dep.circuitOpen,
        failures: dep.consecutiveFailures,
      };
    }
    return summary;
  }
}

/** Singleton */
let _instance: DependencyHealthManager | undefined;

export function initDependencyHealth(failureThreshold?: number, circuitResetMs?: number): DependencyHealthManager {
  _instance = new DependencyHealthManager(failureThreshold, circuitResetMs);
  return _instance;
}

export function getDependencyHealth(): DependencyHealthManager | undefined {
  return _instance;
}
