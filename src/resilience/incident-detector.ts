/**
 * Incident Detector (Phase 4G)
 *
 * Auto-detect: error rate spikes, CSAT drops, PII leaks.
 */

import { v4 as uuid } from 'uuid';
import { Incident, IncidentSeverity, DependencyName } from './types';
import { logger } from '../observability/logger';

export class IncidentDetector {
  private readonly incidents = new Map<string, Incident>();
  private readonly log = logger.child({ component: 'incident-detector' });

  /** Check for incident conditions and create if needed */
  checkAndCreate(
    trigger: string,
    description: string,
    severity: IncidentSeverity,
    affectedDependencies: DependencyName[] = [],
  ): Incident | null {
    // Check if we already have an open incident for this trigger
    for (const incident of this.incidents.values()) {
      if (incident.trigger === trigger && incident.status !== 'resolved') {
        return null; // Already tracked
      }
    }

    const incident: Incident = {
      id: `INC-${uuid().substring(0, 8)}`,
      severity,
      title: trigger,
      description,
      trigger,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      affectedDependencies,
      timeline: [
        { timestamp: Date.now(), action: 'Incident detected automatically', actor: 'system' },
      ],
    };

    this.incidents.set(incident.id, incident);
    this.log.warn({ incidentId: incident.id, severity: severity.label, trigger }, 'Incident created');

    return incident;
  }

  /** Update incident status */
  updateStatus(incidentId: string, status: Incident['status'], actor: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = status;
    incident.updatedAt = Date.now();
    if (status === 'resolved') incident.resolvedAt = Date.now();
    incident.timeline.push({ timestamp: Date.now(), action: `Status changed to ${status}`, actor });

    return true;
  }

  /** Get all incidents */
  getAll(status?: Incident['status']): Incident[] {
    const all = Array.from(this.incidents.values());
    if (status) return all.filter((i) => i.status === status);
    return all;
  }

  /** Get incident by ID */
  get(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  /** Detect error rate spike */
  detectErrorRateSpike(errorRate: number, threshold: number = 0.1): Incident | null {
    if (errorRate <= threshold) return null;
    return this.checkAndCreate(
      'error_rate_spike',
      `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`,
      { level: errorRate > 0.5 ? 1 : 2, label: errorRate > 0.5 ? 'Critical' : 'High' },
      ['llm'],
    );
  }

  /** Detect CSAT drop */
  detectCSATDrop(currentCsat: number, previousCsat: number, threshold: number = 0.5): Incident | null {
    const drop = previousCsat - currentCsat;
    if (drop <= threshold) return null;
    return this.checkAndCreate(
      'csat_drop',
      `CSAT dropped by ${drop.toFixed(1)} (from ${previousCsat.toFixed(1)} to ${currentCsat.toFixed(1)})`,
      { level: 3, label: 'Medium' },
    );
  }
}
