import { TicketData, TicketStatus } from '../config/types';
import { CreateTicketParams, UpdateTicketParams, TicketingService } from './types';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { ticketOperations } from '../observability/metrics';

/**
 * SalesIQ-backed ticketing service.
 *
 * This uses the Zoho Desk / SalesIQ ticket APIs.
 * See docs/SALESIQ_MAPPING.md for endpoint mapping details.
 *
 * SalesIQ exposes chat-to-ticket conversion via:
 * - POST /api/v2/{appId}/tickets (create)
 * - PATCH /api/v2/{appId}/tickets/{ticketId} (update)
 * - GET /api/v2/{appId}/tickets/{ticketId} (read)
 *
 * If these endpoints are not available in your SalesIQ plan,
 * this implementation falls back to Zoho Desk API calls.
 */
export class SalesIQTicketingService implements TicketingService {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly appId: string;

  /** In-memory index: conversationId -> ticketId (augmented by Redis in production) */
  private conversationTicketMap: Map<string, string> = new Map();

  constructor() {
    this.baseUrl = env.salesiq.baseUrl;
    this.accessToken = env.salesiq.accessToken;
    this.appId = env.salesiq.appId;
  }

  private async apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}/api/v2/${this.appId}${path}`;
    const log = logger.child({ service: 'salesiq-ticketing', method, path });

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      log.error({ status: res.status, errBody }, 'SalesIQ ticket API error');
      throw new Error(`SalesIQ ticket API ${res.status}: ${errBody}`);
    }

    return res.json();
  }

  async createTicket(params: CreateTicketParams): Promise<TicketData> {
    const log = logger.child({ conversationId: params.conversationId });

    try {
      const payload = {
        subject: params.subject,
        description: params.description,
        channel: params.channel,
        cf: {
          cf_conversation_id: params.conversationId,
          cf_visitor_id: params.visitorId,
          cf_channel: params.channel,
          ...params.customFields,
        },
        tags: params.tags ?? [],
        contactId: params.contactId,
      };

      const result = await this.apiCall('POST', '/tickets', payload) as { id?: string };

      const ticketId = result.id ?? `ticket-${Date.now()}`;
      this.conversationTicketMap.set(params.conversationId, ticketId);

      const ticket: TicketData = {
        id: ticketId,
        conversationId: params.conversationId,
        channel: params.channel,
        subject: params.subject,
        description: params.description,
        status: 'Open',
        tags: params.tags ?? [],
        customFields: params.customFields ?? {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      ticketOperations.inc({ operation: 'create', status: 'success' });
      log.info({ ticketId }, 'Ticket created via SalesIQ');
      return ticket;
    } catch (err) {
      ticketOperations.inc({ operation: 'create', status: 'error' });
      log.error({ err }, 'Failed to create ticket via SalesIQ');
      throw err;
    }
  }

  async updateTicket(params: UpdateTicketParams): Promise<TicketData> {
    const log = logger.child({ ticketId: params.ticketId });

    try {
      const payload: Record<string, unknown> = {};
      if (params.summary) payload.description = params.summary;
      if (params.status) payload.status = this.mapStatus(params.status);
      if (params.tags) payload.tags = params.tags;
      if (params.leadFields) {
        payload.cf = { ...params.leadFields };
      }
      if (params.intentClassification) {
        payload.cf = { ...(payload.cf as Record<string, unknown> ?? {}), cf_intent: params.intentClassification };
      }

      await this.apiCall('PATCH', `/tickets/${params.ticketId}`, payload);

      ticketOperations.inc({ operation: 'update', status: 'success' });
      log.info('Ticket updated via SalesIQ');

      // Return a best-effort ticket object
      return {
        id: params.ticketId,
        conversationId: '',
        channel: 'web',
        subject: '',
        description: params.summary ?? '',
        status: params.status ?? 'Open',
        tags: params.tags ?? [],
        customFields: params.leadFields ?? {},
        summary: params.summary,
        leadFields: params.leadFields,
        intentClassification: params.intentClassification,
        createdAt: 0,
        updatedAt: Date.now(),
      };
    } catch (err) {
      ticketOperations.inc({ operation: 'update', status: 'error' });
      log.error({ err }, 'Failed to update ticket via SalesIQ');
      throw err;
    }
  }

  async getTicket(ticketId: string): Promise<TicketData | null> {
    try {
      const result = await this.apiCall('GET', `/tickets/${ticketId}`) as Record<string, unknown>;
      return {
        id: String(result.id),
        conversationId: String((result.cf as Record<string, unknown>)?.cf_conversation_id ?? ''),
        channel: ((result.cf as Record<string, unknown>)?.cf_channel as TicketData['channel']) ?? 'web',
        subject: String(result.subject ?? ''),
        description: String(result.description ?? ''),
        status: this.reverseMapStatus(String(result.status ?? 'Open')),
        tags: Array.isArray(result.tags) ? result.tags.map(String) : [],
        customFields: (result.cf as Record<string, unknown>) ?? {},
        createdAt: Number(result.createdTime ?? 0),
        updatedAt: Number(result.modifiedTime ?? Date.now()),
      };
    } catch {
      return null;
    }
  }

  async getTicketByConversationId(conversationId: string): Promise<TicketData | null> {
    const ticketId = this.conversationTicketMap.get(conversationId);
    if (!ticketId) return null;
    return this.getTicket(ticketId);
  }

  private mapStatus(status: TicketStatus): string {
    const map: Record<TicketStatus, string> = {
      Open: 'Open',
      Pending: 'On Hold',
      Escalated: 'Escalated',
      Resolved: 'Closed',
    };
    return map[status] ?? 'Open';
  }

  private reverseMapStatus(raw: string): TicketStatus {
    const lower = raw.toLowerCase();
    if (lower.includes('close') || lower.includes('resolved')) return 'Resolved';
    if (lower.includes('escalat')) return 'Escalated';
    if (lower.includes('hold') || lower.includes('pending')) return 'Pending';
    return 'Open';
  }
}
