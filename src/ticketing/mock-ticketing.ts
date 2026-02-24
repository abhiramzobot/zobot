import { TicketData } from '../config/types';
import { CreateTicketParams, UpdateTicketParams, TicketingService } from './types';
import { logger } from '../observability/logger';
import { ticketOperations } from '../observability/metrics';

/**
 * Mock ticketing service for local development and testing.
 * Stores tickets in-memory and logs all operations.
 */
export class MockTicketingService implements TicketingService {
  private tickets: Map<string, TicketData> = new Map();
  private conversationIndex: Map<string, string> = new Map();
  private idCounter = 1;

  async createTicket(params: CreateTicketParams): Promise<TicketData> {
    const ticketId = `MOCK-${this.idCounter++}`;

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

    this.tickets.set(ticketId, ticket);
    this.conversationIndex.set(params.conversationId, ticketId);

    ticketOperations.inc({ operation: 'create', status: 'success' });
    logger.info({ ticketId, conversationId: params.conversationId }, '[MOCK] Ticket created');

    return ticket;
  }

  async updateTicket(params: UpdateTicketParams): Promise<TicketData> {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      ticketOperations.inc({ operation: 'update', status: 'error' });
      throw new Error(`Ticket ${params.ticketId} not found`);
    }

    if (params.summary) ticket.summary = params.summary;
    if (params.status) ticket.status = params.status;
    if (params.tags) ticket.tags = [...new Set([...ticket.tags, ...params.tags])];
    if (params.leadFields) ticket.leadFields = { ...ticket.leadFields, ...params.leadFields };
    if (params.intentClassification) ticket.intentClassification = params.intentClassification;
    if (params.description) ticket.description = params.description;
    ticket.updatedAt = Date.now();

    this.tickets.set(params.ticketId, ticket);

    ticketOperations.inc({ operation: 'update', status: 'success' });
    logger.info({ ticketId: params.ticketId, status: ticket.status }, '[MOCK] Ticket updated');

    return ticket;
  }

  async getTicket(ticketId: string): Promise<TicketData | null> {
    return this.tickets.get(ticketId) ?? null;
  }

  async getTicketByConversationId(conversationId: string): Promise<TicketData | null> {
    const ticketId = this.conversationIndex.get(conversationId);
    if (!ticketId) return null;
    return this.tickets.get(ticketId) ?? null;
  }

  /** Test helper: get all tickets */
  getAllTickets(): TicketData[] {
    return Array.from(this.tickets.values());
  }

  /** Test helper: reset state */
  reset(): void {
    this.tickets.clear();
    this.conversationIndex.clear();
    this.idCounter = 1;
  }
}
