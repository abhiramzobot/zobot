/**
 * Outbound Proactive Communication Types (Phase 3D)
 */

import { Channel } from '../config/types';

export type OutboundTriggerType =
  | 'order_status_change'
  | 'cart_abandonment'
  | 'reorder_window'
  | 'delivery_update'
  | 'payment_reminder'
  | 'feedback_request'
  | 'scheduled';

export interface OutboundTrigger {
  type: OutboundTriggerType;
  customerId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface OutboundTemplate {
  id: string;
  name: string;
  channel: Channel;
  /** WhatsApp HSM template name */
  hsmTemplateName?: string;
  /** Template body with {{placeholders}} */
  body: string;
  /** Template variables */
  variables: string[];
  language: string;
}

export interface OutboundMessage {
  id: string;
  triggerId: string;
  triggerType: OutboundTriggerType;
  customerId: string;
  channel: Channel;
  templateId: string;
  renderedBody: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'blocked';
  sentAt?: number;
  createdAt: number;
  /** Governance: why was it blocked? */
  blockReason?: string;
}

export interface OutboundGovernance {
  /** Maximum outbound messages per customer per day */
  maxPerDay: number;
  /** Quiet hours start (24hr format, e.g., 21 = 9PM) */
  quietHoursStart: number;
  /** Quiet hours end (24hr format, e.g., 9 = 9AM) */
  quietHoursEnd: number;
  /** DND list (customer IDs that opted out) */
  dndEnabled: boolean;
}

export interface OutboundConfig {
  enabled: boolean;
  governance: OutboundGovernance;
  /** Default channel for outbound */
  defaultChannel: Channel;
}
