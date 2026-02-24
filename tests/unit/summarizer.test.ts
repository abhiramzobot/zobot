import { ConversationSummarizer, ConversationMessage } from '../../src/summarization/summarizer';

describe('ConversationSummarizer', () => {
  let summarizer: ConversationSummarizer;

  beforeEach(() => {
    summarizer = new ConversationSummarizer();
  });

  describe('summarize', () => {
    it('should extract key issues from user messages', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'I want a refund for my order' },
        { role: 'assistant', content: 'I can help with that.' },
        { role: 'user', content: 'The product was damaged when I received it' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.keyIssues).toContain('Refund/return request');
      expect(summary.keyIssues).toContain('Damaged/defective product');
    });

    it('should detect negative sentiment from frustrated customer', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'This is terrible! I am so angry!' },
        { role: 'assistant', content: 'I apologize.' },
        { role: 'user', content: 'Horrible service, this is the worst experience' },
        { role: 'assistant', content: 'Let me help.' },
        { role: 'user', content: 'I am disappointed and frustrated with this awful service' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.customerSentiment).toBe('frustrated');
    });

    it('should detect positive sentiment', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Thank you so much! Great service!' },
        { role: 'assistant', content: 'Glad to help!' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.customerSentiment).toBe('positive');
    });

    it('should detect mixed sentiment', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'The product is great but delivery was terrible' },
        { role: 'assistant', content: 'Thank you for the feedback.' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.customerSentiment).toBe('mixed');
    });

    it('should detect neutral sentiment', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'What is the price of dental composite?' },
        { role: 'assistant', content: 'The price is 1499.' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.customerSentiment).toBe('neutral');
    });

    it('should extract tools used from messages', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Track my shipment' },
        {
          role: 'assistant',
          content: 'Here is your tracking info.',
          toolCalls: [{ name: 'track_shipment', result: 'In Transit' }],
        },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.toolsUsed).toContain('track_shipment');
    });

    it('should map tool names to action descriptions', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Search for products' },
        {
          role: 'assistant',
          content: 'Found products.',
          toolCalls: [{ name: 'search_products' }, { name: 'add_to_cart' }],
        },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.actionsAttempted).toContain('Searched products');
      expect(summary.actionsAttempted).toContain('Added product to cart');
    });

    it('should default to "General inquiry" when no patterns match', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.keyIssues).toEqual(['General inquiry']);
    });

    it('should include message count', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'Help me' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.messageCount).toBe(3);
    });

    it('should recommend specific actions for frustrated customers', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'This is terrible, I am angry and frustrated!' },
        { role: 'user', content: 'Horrible experience, disappointed!' },
        { role: 'user', content: 'Worst service, awful!' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.recommendedAction).toContain('frustration');
    });

    it('should recommend refund review for refund requests', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'I want a refund please' },
      ];

      const summary = summarizer.summarize(messages);
      expect(summary.recommendedAction).toContain('refund');
    });
  });

  describe('buildSummaryPrompt', () => {
    it('should build a valid LLM prompt with transcript', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Welcome!' },
        { role: 'system', content: 'System note' },
      ];

      const prompt = summarizer.buildSummaryPrompt(messages);
      expect(prompt).toContain('Customer: Hello');
      expect(prompt).toContain('Bot: Welcome!');
      expect(prompt).toContain('System: System note');
      expect(prompt).toContain('CONVERSATION');
    });
  });
});
