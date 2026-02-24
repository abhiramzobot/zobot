/**
 * Outbound Engine (Phase 3D)
 *
 * Trigger processing + governance.
 */

import { v4 as uuid } from 'uuid';
import { OutboundTrigger, OutboundMessage, OutboundTemplate, OutboundConfig, OutboundGovernance } from './types';
import { logger } from '../observability/logger';

const DEFAULT_GOVERNANCE: OutboundGovernance = {
  maxPerDay: 3,
  quietHoursStart: 21,
  quietHoursEnd: 9,
  dndEnabled: true,
};

const DEFAULT_CONFIG: OutboundConfig = {
  enabled: false,
  governance: DEFAULT_GOVERNANCE,
  defaultChannel: 'whatsapp',
};

export class OutboundEngine {
  private readonly log = logger.child({ component: 'outbound-engine' });
  private readonly templates = new Map<string, OutboundTemplate>();
  private readonly messageLog = new Map<string, OutboundMessage[]>(); // customerId → messages
  private readonly dndList = new Set<string>();

  constructor(private readonly config: OutboundConfig = DEFAULT_CONFIG) {}

  /** Register a template */
  registerTemplate(template: OutboundTemplate): void {
    this.templates.set(template.id, template);
  }

  /** Process an outbound trigger */
  async processTrigger(trigger: OutboundTrigger): Promise<OutboundMessage | null> {
    if (!this.config.enabled) return null;

    // Governance checks
    const blockReason = this.checkGovernance(trigger.customerId);
    if (blockReason) {
      this.log.info({ customerId: trigger.customerId, blockReason }, 'Outbound blocked by governance');
      return {
        id: uuid(),
        triggerId: `trigger_${Date.now()}`,
        triggerType: trigger.type,
        customerId: trigger.customerId,
        channel: this.config.defaultChannel,
        templateId: '',
        renderedBody: '',
        status: 'blocked',
        blockReason,
        createdAt: Date.now(),
      };
    }

    // Find appropriate template
    const template = this.findTemplate(trigger.type);
    if (!template) {
      this.log.warn({ triggerType: trigger.type }, 'No template found for trigger type');
      return null;
    }

    // Render template
    const renderedBody = this.renderTemplate(template, trigger.data);

    const message: OutboundMessage = {
      id: uuid(),
      triggerId: `trigger_${Date.now()}`,
      triggerType: trigger.type,
      customerId: trigger.customerId,
      channel: template.channel ?? this.config.defaultChannel,
      templateId: template.id,
      renderedBody,
      status: 'queued',
      createdAt: Date.now(),
    };

    // Log message
    if (!this.messageLog.has(trigger.customerId)) {
      this.messageLog.set(trigger.customerId, []);
    }
    this.messageLog.get(trigger.customerId)!.push(message);

    this.log.info({ messageId: message.id, customerId: trigger.customerId, type: trigger.type }, 'Outbound message queued');
    return message;
  }

  /** Add customer to DND list */
  addToDND(customerId: string): void {
    this.dndList.add(customerId);
  }

  /** Remove customer from DND list */
  removeFromDND(customerId: string): void {
    this.dndList.delete(customerId);
  }

  private checkGovernance(customerId: string): string | null {
    const gov = this.config.governance;

    // DND check
    if (gov.dndEnabled && this.dndList.has(customerId)) {
      return 'Customer on DND list';
    }

    // Quiet hours check
    const hour = new Date().getHours();
    if (hour >= gov.quietHoursStart || hour < gov.quietHoursEnd) {
      return `Quiet hours (${gov.quietHoursStart}:00 - ${gov.quietHoursEnd}:00)`;
    }

    // Daily limit check
    const todayMessages = (this.messageLog.get(customerId) ?? []).filter((m) => {
      const msgDate = new Date(m.createdAt).toDateString();
      return msgDate === new Date().toDateString() && m.status !== 'blocked';
    });

    if (todayMessages.length >= gov.maxPerDay) {
      return `Daily limit exceeded (${gov.maxPerDay}/day)`;
    }

    return null;
  }

  private findTemplate(triggerType: string): OutboundTemplate | undefined {
    return Array.from(this.templates.values()).find(
      (t) => t.name.toLowerCase().includes(triggerType.replace(/_/g, ' ')),
    );
  }

  private renderTemplate(template: OutboundTemplate, data: Record<string, unknown>): string {
    let body = template.body;
    for (const variable of template.variables) {
      const value = String(data[variable] ?? '');
      body = body.replace(`{{${variable}}}`, value);
    }
    return body;
  }
}
