import { Channel, InboundMessage } from '../config/types';

/** Raw SalesIQ webhook payload (varies by event type) */
export interface SalesIQWebhookPayload {
  event?: string;
  data?: {
    visitor?: {
      id?: string;
      name?: string;
      email?: string;
      phone?: string;
      info?: Record<string, unknown>;
    };
    message?: {
      text?: string;
      attachments?: Array<{
        type?: string;
        url?: string;
        name?: string;
      }>;
    };
    department?: {
      id?: string;
      name?: string;
    };
    chat?: {
      id?: string;
      channel?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Outbound channel adapter interface */
export interface ChannelOutbound {
  sendMessage(conversationId: string, text: string, channel: Channel): Promise<void>;
  sendTyping(conversationId: string, channel: Channel): Promise<void>;
  escalateToHuman(conversationId: string, reason: string, summary: string, channel: Channel): Promise<void>;
  addTags(conversationId: string, tags: string[], channel: Channel): Promise<void>;
  setDepartment(conversationId: string, departmentId: string, channel: Channel): Promise<void>;
  // ───── Rich Media (Enhancement v2) ─────
  sendRichMessage?(conversationId: string, payload: Record<string, unknown>, channel: Channel): Promise<void>;
  sendTemplateMessage?(conversationId: string, templateName: string, variables: Record<string, string>, channel: Channel): Promise<void>;
}

/** Webhook parse result */
export type WebhookParseResult =
  | { ok: true; message: InboundMessage }
  | { ok: false; reason: string };
