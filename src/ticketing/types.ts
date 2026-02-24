import { TicketData, TicketStatus, Channel } from '../config/types';

export interface CreateTicketParams {
  conversationId: string;
  channel: Channel;
  visitorId: string;
  contactId?: string;
  subject: string;
  description: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface UpdateTicketParams {
  ticketId: string;
  summary?: string;
  status?: TicketStatus;
  tags?: string[];
  leadFields?: Record<string, unknown>;
  intentClassification?: string;
  description?: string;
}

export interface TicketingService {
  createTicket(params: CreateTicketParams): Promise<TicketData>;
  updateTicket(params: UpdateTicketParams): Promise<TicketData>;
  getTicket(ticketId: string): Promise<TicketData | null>;
  getTicketByConversationId(conversationId: string): Promise<TicketData | null>;
}
