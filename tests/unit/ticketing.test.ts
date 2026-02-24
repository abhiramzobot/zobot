import { MockTicketingService } from '../../src/ticketing/mock-ticketing';

describe('MockTicketingService', () => {
  let service: MockTicketingService;

  beforeEach(() => {
    service = new MockTicketingService();
  });

  describe('createTicket', () => {
    it('should create a ticket with correct fields', async () => {
      const ticket = await service.createTicket({
        conversationId: 'conv-1',
        channel: 'whatsapp',
        visitorId: 'v-1',
        subject: 'Chat - whatsapp - v-1',
        description: 'Hello, I need help',
        tags: ['zobot:whatsapp', 'zobot:new'],
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.id).toMatch(/^MOCK-/);
      expect(ticket.conversationId).toBe('conv-1');
      expect(ticket.channel).toBe('whatsapp');
      expect(ticket.status).toBe('Open');
      expect(ticket.subject).toBe('Chat - whatsapp - v-1');
      expect(ticket.tags).toContain('zobot:whatsapp');
    });

    it('should create unique ticket IDs', async () => {
      const t1 = await service.createTicket({
        conversationId: 'conv-1',
        channel: 'web',
        visitorId: 'v-1',
        subject: 'Test 1',
        description: 'Test',
      });
      const t2 = await service.createTicket({
        conversationId: 'conv-2',
        channel: 'web',
        visitorId: 'v-2',
        subject: 'Test 2',
        description: 'Test',
      });

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('updateTicket', () => {
    it('should update ticket summary and status', async () => {
      const ticket = await service.createTicket({
        conversationId: 'conv-1',
        channel: 'web',
        visitorId: 'v-1',
        subject: 'Test',
        description: 'Test',
      });

      const updated = await service.updateTicket({
        ticketId: ticket.id!,
        summary: 'User asking about product pricing',
        status: 'Pending',
        tags: ['product-inquiry'],
        intentClassification: 'pricing_question',
      });

      expect(updated.summary).toBe('User asking about product pricing');
      expect(updated.status).toBe('Pending');
      expect(updated.tags).toContain('product-inquiry');
      expect(updated.intentClassification).toBe('pricing_question');
    });

    it('should merge tags without duplicates', async () => {
      const ticket = await service.createTicket({
        conversationId: 'conv-1',
        channel: 'web',
        visitorId: 'v-1',
        subject: 'Test',
        description: 'Test',
        tags: ['tag1', 'tag2'],
      });

      const updated = await service.updateTicket({
        ticketId: ticket.id!,
        tags: ['tag2', 'tag3'],
      });

      expect(updated.tags).toContain('tag1');
      expect(updated.tags).toContain('tag2');
      expect(updated.tags).toContain('tag3');
      expect(updated.tags.filter((t) => t === 'tag2')).toHaveLength(1);
    });

    it('should throw for non-existent ticket', async () => {
      await expect(
        service.updateTicket({ ticketId: 'fake-id', summary: 'test' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('getTicketByConversationId', () => {
    it('should retrieve ticket by conversationId', async () => {
      await service.createTicket({
        conversationId: 'conv-1',
        channel: 'web',
        visitorId: 'v-1',
        subject: 'Test',
        description: 'Test',
      });

      const ticket = await service.getTicketByConversationId('conv-1');
      expect(ticket).not.toBeNull();
      expect(ticket!.conversationId).toBe('conv-1');
    });

    it('should return null for unknown conversationId', async () => {
      const ticket = await service.getTicketByConversationId('unknown');
      expect(ticket).toBeNull();
    });
  });
});
