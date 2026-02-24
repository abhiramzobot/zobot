/**
 * SLA Alerter (Phase 2C)
 *
 * Emits breach alerts via webhook/ticket note/metrics.
 */

import { SLABreachAlert } from './types';
import { logger } from '../observability/logger';

export class SLAAlerter {
  private readonly log = logger.child({ component: 'sla-alerter' });
  private readonly listeners: Array<(alert: SLABreachAlert) => void> = [];

  /** Register an alert listener */
  onAlert(listener: (alert: SLABreachAlert) => void): void {
    this.listeners.push(listener);
  }

  /** Emit alerts */
  async emit(alerts: SLABreachAlert[]): Promise<void> {
    for (const alert of alerts) {
      this.log.warn({
        conversationId: alert.conversationId,
        tier: alert.tier,
        type: alert.type,
        percentageConsumed: alert.percentageConsumed,
        remainingSeconds: alert.remainingSeconds,
      }, alert.message);

      for (const listener of this.listeners) {
        try {
          listener(alert);
        } catch (err) {
          this.log.error({ err }, 'SLA alert listener error');
        }
      }
    }
  }
}
