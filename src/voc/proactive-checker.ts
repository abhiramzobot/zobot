/**
 * Proactive Support Engine (Phase 10)
 *
 * Pre-LLM context enrichment: checks customer's recent orders/shipments
 * for known issues (delayed shipments, refund SLA breaches, repeated
 * delivery failures, high-value at-risk customers).
 *
 * When issues are detected, injects proactive alerts into the LLM context
 * so the agent can acknowledge problems without waiting for the customer to explain.
 */

import { ExtractedEntity } from './types';
import { StructuredMemory } from '../config/types';
import { ToolContext, ToolResult } from '../tools/types';
import { toolRuntime } from '../tools/runtime';
import { logger } from '../observability/logger';
import { proactiveAlertsGenerated } from '../observability/metrics';

export interface ProactiveAlert {
  type: 'shipment_delayed' | 'refund_sla_breach' | 'delivery_failed' | 'high_value_at_risk';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestedAction: string;
  data?: Record<string, unknown>;
}

export interface ProactiveConfig {
  enabled: boolean;
  /** Check order status for delays */
  checkShipmentDelays: boolean;
  /** Check refund SLA breaches */
  checkRefundSLA: boolean;
  /** Days after EDD before flagging as delayed */
  delayThresholdDays: number;
  /** Refund SLA in working days */
  refundSLADays: number;
}

const DEFAULT_CONFIG: ProactiveConfig = {
  enabled: true,
  checkShipmentDelays: true,
  checkRefundSLA: true,
  delayThresholdDays: 2,
  refundSLADays: 7,
};

export class ProactiveChecker {
  private readonly log = logger.child({ component: 'proactive-checker' });
  private readonly config: ProactiveConfig;

  constructor(config?: Partial<ProactiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check customer context for known issues.
   * Uses extracted entities and structured memory to identify problems proactively.
   */
  async check(
    entities: ExtractedEntity[],
    structuredMemory: StructuredMemory,
    toolCtx: ToolContext,
  ): Promise<ProactiveAlert[]> {
    if (!this.config.enabled) return [];

    const alerts: ProactiveAlert[] = [];

    try {
      // Collect order numbers from entities and memory
      const orderNumbers = new Set<string>();
      for (const entity of entities) {
        if (entity.type === 'order_number') {
          orderNumbers.add(entity.value);
        }
      }
      if (structuredMemory.orderNumbers) {
        for (const orderNum of structuredMemory.orderNumbers) {
          orderNumbers.add(orderNum);
        }
      }

      // Check each order for issues
      if (this.config.checkShipmentDelays && orderNumbers.size > 0) {
        for (const orderNum of orderNumbers) {
          const shipmentAlerts = await this.checkShipmentStatus(orderNum, toolCtx);
          alerts.push(...shipmentAlerts);
        }
      }

      // Check for phone-based order lookup (if phone available but no order numbers)
      if (orderNumbers.size === 0 && structuredMemory.phone) {
        const phoneEntity = entities.find((e) => e.type === 'phone');
        if (phoneEntity) {
          const orderAlerts = await this.checkCustomerOrders(phoneEntity.value, toolCtx);
          alerts.push(...orderAlerts);
        }
      }

      // Record metrics
      for (const alert of alerts) {
        proactiveAlertsGenerated.inc({ type: alert.type });
      }

      if (alerts.length > 0) {
        this.log.info({ alertCount: alerts.length, types: alerts.map((a) => a.type) }, 'Proactive alerts generated');
      }
    } catch (err) {
      // Proactive checks should never block the main flow
      this.log.warn({ err }, 'Proactive check failed (non-blocking)');
    }

    return alerts;
  }

  /**
   * Format alerts as context for the LLM system prompt.
   */
  formatForPrompt(alerts: ProactiveAlert[]): string {
    if (alerts.length === 0) return '';

    const lines = [
      '--- PROACTIVE CONTEXT ---',
      'The following issues were detected for this customer. Acknowledge them proactively:',
      '',
    ];

    for (const alert of alerts) {
      lines.push(`[${alert.severity.toUpperCase()}] ${alert.message}`);
      lines.push(`  Suggested: ${alert.suggestedAction}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Check shipment status for an order number.
   * Uses the existing track_shipment tool.
   */
  private async checkShipmentStatus(orderNum: string, toolCtx: ToolContext): Promise<ProactiveAlert[]> {
    const alerts: ProactiveAlert[] = [];

    try {
      const result: ToolResult = await toolRuntime.execute(
        'track_shipment',
        { order_number: orderNum },
        toolCtx,
      );

      if (!result.success || !result.data) return alerts;

      const data = result.data as Record<string, unknown>;
      const status = String(data.status ?? '').toLowerCase();
      const edd = data.expected_delivery_date as string | undefined;

      // Check if shipment is delayed past EDD
      if (edd && status !== 'delivered' && status !== 'cancelled') {
        const eddDate = new Date(edd);
        const now = new Date();
        const daysLate = Math.floor((now.getTime() - eddDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLate > this.config.delayThresholdDays) {
          alerts.push({
            type: 'shipment_delayed',
            severity: daysLate > 5 ? 'critical' : 'warning',
            message: `Order ${orderNum} was expected by ${edd} but is ${daysLate} days late. Current status: ${status}`,
            suggestedAction: 'Proactively acknowledge the delay and provide current tracking status. Offer to escalate to logistics if needed.',
            data: { orderNum, edd, daysLate, status },
          });
        }
      }

      // Check for repeated delivery failures
      const failedAttempts = data.failed_delivery_attempts as number | undefined;
      if (failedAttempts && failedAttempts >= 2) {
        alerts.push({
          type: 'delivery_failed',
          severity: 'critical',
          message: `Order ${orderNum} has ${failedAttempts} failed delivery attempt(s). Customer may need address correction.`,
          suggestedAction: 'Ask if the delivery address is correct and offer to arrange a reattempt or alternative delivery.',
          data: { orderNum, failedAttempts },
        });
      }
    } catch {
      // Tool call failed — skip this check silently
    }

    return alerts;
  }

  /**
   * Check customer's recent orders for any issues.
   * Uses lookup_customer_orders tool.
   */
  private async checkCustomerOrders(phone: string, toolCtx: ToolContext): Promise<ProactiveAlert[]> {
    const alerts: ProactiveAlert[] = [];

    try {
      const result: ToolResult = await toolRuntime.execute(
        'lookup_customer_orders',
        { phone },
        toolCtx,
      );

      if (!result.success || !result.data) return alerts;

      const data = result.data as Record<string, unknown>;
      const orders = data.orders as Array<Record<string, unknown>> | undefined;

      if (!orders || orders.length === 0) return alerts;

      // Check recent orders for refund SLA breaches
      for (const order of orders.slice(0, 3)) {
        const returnStatus = String(order.return_status ?? '').toLowerCase();
        const refundStatus = String(order.refund_status ?? '').toLowerCase();

        if (returnStatus === 'returned' && refundStatus !== 'refunded') {
          const returnDate = order.return_completed_date as string | undefined;
          if (returnDate) {
            const returnCompleted = new Date(returnDate);
            const daysSinceReturn = Math.floor(
              (Date.now() - returnCompleted.getTime()) / (1000 * 60 * 60 * 24),
            );

            if (daysSinceReturn > this.config.refundSLADays) {
              alerts.push({
                type: 'refund_sla_breach',
                severity: 'warning',
                message: `Order ${order.orderNo ?? order.order_number} return completed ${daysSinceReturn} days ago but refund is still ${refundStatus}. SLA is ${this.config.refundSLADays} working days.`,
                suggestedAction: 'Proactively acknowledge the refund delay and provide current refund status. Escalate to Payment Desk if beyond SLA.',
                data: { orderNum: order.orderNo ?? order.order_number, daysSinceReturn, refundStatus },
              });
            }
          }
        }
      }
    } catch {
      // Tool call failed — skip this check silently
    }

    return alerts;
  }
}
