import { Channel, InboundMessage } from '../config/types';
import { SalesIQWebhookPayload, ChannelOutbound, WebhookParseResult } from './types';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { redactPII } from '../observability/pii-redactor';

/**
 * Map SalesIQ channel strings to our canonical Channel type.
 */
function mapChannel(raw?: string): Channel {
  if (!raw) return 'web';
  const lower = raw.toLowerCase();
  if (lower.includes('whatsapp')) return 'whatsapp';
  if (lower.includes('business_chat') || lower.includes('businesschat') || lower.includes('apple')) return 'business_chat';
  return 'web';
}

/**
 * Parse a raw SalesIQ webhook payload into a normalized InboundMessage.
 */
export function parseSalesIQWebhook(payload: SalesIQWebhookPayload, tenantId: string): WebhookParseResult {
  try {
    const data = payload.data;
    if (!data) {
      return { ok: false, reason: 'Missing data field in webhook payload' };
    }

    const chatId = data.chat?.id;
    const visitorId = data.visitor?.id;

    if (!chatId) {
      return { ok: false, reason: 'Missing chat.id in webhook payload' };
    }
    if (!visitorId) {
      return { ok: false, reason: 'Missing visitor.id in webhook payload' };
    }

    const messageText = data.message?.text;
    if (!messageText) {
      return { ok: false, reason: 'Missing message text in webhook payload' };
    }

    const channel = mapChannel(data.chat?.channel);
    const visitor = data.visitor ?? {};

    const message: InboundMessage = {
      channel,
      conversationId: String(chatId),
      visitorId: String(visitorId),
      contactId: visitor.email ? String(visitor.email) : undefined,
      userProfile: {
        name: visitor.name ? String(visitor.name) : undefined,
        phone: visitor.phone ? String(visitor.phone) : undefined,
        email: visitor.email ? String(visitor.email) : undefined,
        locale: undefined,
        timezone: undefined,
        attributes: visitor.info ? Object.fromEntries(
          Object.entries(visitor.info).map(([k, v]) => [k, String(v)])
        ) : undefined,
      },
      message: {
        text: String(messageText),
        attachments: data.message?.attachments?.map((a) => ({
          type: a.type ?? 'unknown',
          url: a.url ?? '',
          name: a.name,
        })),
      },
      timestamp: Date.now(),
      raw: env.isDev ? payload as Record<string, unknown> : undefined,
      tenantId,
    };

    return { ok: true, message };
  } catch (err) {
    logger.error({ err }, 'Failed to parse SalesIQ webhook');
    return { ok: false, reason: 'Parse error' };
  }
}

/**
 * SalesIQ outbound adapter — sends messages back through SalesIQ API.
 * Uses SalesIQ REST APIs to reply to visitors.
 */
export class SalesIQOutboundAdapter implements ChannelOutbound {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly appId: string;
  private readonly screenName: string;

  constructor() {
    this.baseUrl = env.salesiq.baseUrl;
    this.accessToken = env.salesiq.accessToken;
    this.appId = env.salesiq.appId;
    this.screenName = env.salesiq.screenName;
  }

  private async apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}/api/v2/${this.appId}${path}`;
    const log = logger.child({ adapter: 'salesiq', method, path: redactPII(path) });

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const errBody = await res.text();
        log.error({ status: res.status, errBody }, 'SalesIQ API error');
        throw new Error(`SalesIQ API ${res.status}: ${errBody}`);
      }

      return res.json();
    } catch (err) {
      log.error({ err }, 'SalesIQ API call failed');
      throw err;
    }
  }

  async sendMessage(conversationId: string, text: string, _channel: Channel): Promise<void> {
    await this.apiCall('POST', `/chats/${conversationId}/messages`, {
      message: { text },
      sender: { screen_name: this.screenName, type: 'bot' },
    });
  }

  async sendTyping(conversationId: string, _channel: Channel): Promise<void> {
    try {
      await this.apiCall('POST', `/chats/${conversationId}/typing`, {
        typing: true,
        sender: { screen_name: this.screenName, type: 'bot' },
      });
    } catch {
      // best-effort; swallow errors
    }
  }

  async escalateToHuman(conversationId: string, reason: string, summary: string, _channel: Channel): Promise<void> {
    await this.apiCall('POST', `/chats/${conversationId}/escalate`, {
      reason,
      summary,
    });
  }

  async addTags(conversationId: string, tags: string[], _channel: Channel): Promise<void> {
    await this.apiCall('PATCH', `/chats/${conversationId}/tags`, {
      tags,
    });
  }

  async setDepartment(conversationId: string, departmentId: string, _channel: Channel): Promise<void> {
    await this.apiCall('PATCH', `/chats/${conversationId}`, {
      department: { id: departmentId },
    });
  }

  // ───── Rich Media (Enhancement v2) ─────

  async sendRichMessage(conversationId: string, payload: Record<string, unknown>, _channel: Channel): Promise<void> {
    try {
      await this.apiCall('POST', `/chats/${conversationId}/messages`, {
        message: { rich_content: payload },
        sender: { screen_name: this.screenName, type: 'bot' },
      });
    } catch (err) {
      // Fallback: send as text if rich media fails
      const fallback = (payload as { textFallback?: string }).textFallback;
      if (fallback) {
        await this.sendMessage(conversationId, fallback, _channel);
      } else {
        throw err;
      }
    }
  }

  async sendTemplateMessage(
    conversationId: string,
    templateName: string,
    variables: Record<string, string>,
    _channel: Channel,
  ): Promise<void> {
    await this.apiCall('POST', `/chats/${conversationId}/messages`, {
      message: {
        template: {
          name: templateName,
          variables: Object.entries(variables).map(([key, value]) => ({ key, value })),
        },
      },
      sender: { screen_name: this.screenName, type: 'bot' },
    });
  }
}
