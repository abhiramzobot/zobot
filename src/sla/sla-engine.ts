/**
 * SLA Engine (Phase 2C)
 *
 * Tier assignment, breach checking, prediction.
 */

import { SLATier, SLATarget, SLARecord, SLAStatus, SLABreachAlert, SLAConfig, SLAStore } from './types';
import { logger } from '../observability/logger';

const DEFAULT_TARGETS: Record<SLATier, SLATarget> = {
  platinum: { tier: 'platinum', ttfrSeconds: 60, ttrSeconds: 1800, csatTarget: 4.5 },
  gold: { tier: 'gold', ttfrSeconds: 180, ttrSeconds: 3600, csatTarget: 4.0 },
  silver: { tier: 'silver', ttfrSeconds: 300, ttrSeconds: 7200, csatTarget: 3.5 },
  bronze: { tier: 'bronze', ttfrSeconds: 600, ttrSeconds: 14400, csatTarget: 3.0 },
};

const DEFAULT_ALERT_THRESHOLDS = [70, 90, 100];

export class SLAEngine {
  private readonly log = logger.child({ component: 'sla-engine' });
  private readonly targets: Record<SLATier, SLATarget>;
  private readonly alertThresholds: number[];

  constructor(
    private readonly store: SLAStore,
    config?: Partial<SLAConfig>,
  ) {
    this.targets = config?.targets ?? DEFAULT_TARGETS;
    this.alertThresholds = config?.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS;
  }

  /** Assign SLA tier based on customer attributes */
  assignTier(attributes: { ltv?: number; orderCount?: number; segment?: string }): SLATier {
    if (attributes.segment === 'vip' || (attributes.ltv && attributes.ltv > 50000)) return 'platinum';
    if (attributes.orderCount && attributes.orderCount > 10) return 'gold';
    if (attributes.orderCount && attributes.orderCount > 3) return 'silver';
    return 'bronze';
  }

  /** Create SLA record for a conversation */
  async createRecord(conversationId: string, tier: SLATier): Promise<SLARecord> {
    const target = this.targets[tier];
    const record: SLARecord = {
      conversationId,
      tier,
      target,
      startedAt: Date.now(),
      status: 'on_track',
      alertsSentAt: [],
    };
    await this.store.save(record);
    return record;
  }

  /** Record first response */
  async recordFirstResponse(conversationId: string): Promise<void> {
    const record = await this.store.get(conversationId);
    if (!record || record.firstResponseAt) return;

    record.firstResponseAt = Date.now();
    const elapsed = (record.firstResponseAt - record.startedAt) / 1000;

    if (elapsed > record.target.ttfrSeconds) {
      record.status = 'breached';
      this.log.warn({ conversationId, elapsed, target: record.target.ttfrSeconds }, 'TTFR SLA breached');
    }

    await this.store.save(record);
  }

  /** Record resolution */
  async recordResolution(conversationId: string): Promise<void> {
    const record = await this.store.get(conversationId);
    if (!record) return;

    record.resolvedAt = Date.now();
    const elapsed = (record.resolvedAt - record.startedAt) / 1000;

    if (elapsed > record.target.ttrSeconds) {
      record.status = 'breached';
    }

    await this.store.save(record);
  }

  /** Check and return breach alerts */
  async checkBreach(conversationId: string): Promise<SLABreachAlert[]> {
    const record = await this.store.get(conversationId);
    if (!record || record.resolvedAt) return [];

    const alerts: SLABreachAlert[] = [];
    const now = Date.now();

    // Check TTFR
    if (!record.firstResponseAt) {
      const elapsed = (now - record.startedAt) / 1000;
      const pct = (elapsed / record.target.ttfrSeconds) * 100;
      alerts.push(...this.generateAlerts(record, 'ttfr', pct, record.target.ttfrSeconds - elapsed));
    }

    // Check TTR
    const ttrElapsed = (now - record.startedAt) / 1000;
    const ttrPct = (ttrElapsed / record.target.ttrSeconds) * 100;
    alerts.push(...this.generateAlerts(record, 'ttr', ttrPct, record.target.ttrSeconds - ttrElapsed));

    // Update status
    if (ttrPct >= 100) {
      record.status = 'breached';
    } else if (ttrPct >= 70) {
      record.status = 'warning';
    }

    await this.store.save(record);
    return alerts;
  }

  /** Predict breach probability */
  predictBreach(record: SLARecord): { probability: number; estimatedBreachIn: number } {
    const now = Date.now();
    const elapsed = (now - record.startedAt) / 1000;
    const remaining = record.target.ttrSeconds - elapsed;
    const probability = Math.min(1, elapsed / record.target.ttrSeconds);

    return { probability, estimatedBreachIn: Math.max(0, remaining) };
  }

  private generateAlerts(
    record: SLARecord,
    type: 'ttfr' | 'ttr',
    percentageConsumed: number,
    remainingSeconds: number,
  ): SLABreachAlert[] {
    const alerts: SLABreachAlert[] = [];

    for (const threshold of this.alertThresholds) {
      if (percentageConsumed >= threshold && !record.alertsSentAt.includes(threshold)) {
        record.alertsSentAt.push(threshold);
        alerts.push({
          conversationId: record.conversationId,
          tier: record.tier,
          type,
          percentageConsumed: Math.round(percentageConsumed),
          remainingSeconds: Math.max(0, remainingSeconds),
          message: `SLA ${type.toUpperCase()} ${threshold}% consumed for ${record.tier} tier conversation`,
          timestamp: Date.now(),
        });
      }
    }

    return alerts;
  }
}
