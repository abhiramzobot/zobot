import { parseSalesIQWebhook } from '../../src/channels/salesiq-adapter';
import { SalesIQWebhookPayload } from '../../src/channels/types';

describe('parseSalesIQWebhook', () => {
  const validPayload: SalesIQWebhookPayload = {
    event: 'chat.message',
    data: {
      chat: { id: 'chat-123', channel: 'whatsapp' },
      visitor: {
        id: 'visitor-456',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
      },
      message: {
        text: 'Hello, I need help with your product',
        attachments: [],
      },
    },
  };

  it('should parse a valid WhatsApp webhook payload', () => {
    const result = parseSalesIQWebhook(validPayload, 'default');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok');

    expect(result.message.channel).toBe('whatsapp');
    expect(result.message.conversationId).toBe('chat-123');
    expect(result.message.visitorId).toBe('visitor-456');
    expect(result.message.message.text).toBe('Hello, I need help with your product');
    expect(result.message.userProfile.name).toBe('John Doe');
    expect(result.message.userProfile.email).toBe('john@example.com');
    expect(result.message.tenantId).toBe('default');
  });

  it('should map business_chat channel correctly', () => {
    const payload: SalesIQWebhookPayload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        chat: { id: 'chat-789', channel: 'business_chat' },
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.channel).toBe('business_chat');
  });

  it('should default to web channel for unknown channels', () => {
    const payload: SalesIQWebhookPayload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        chat: { id: 'chat-101', channel: 'some_other_channel' },
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.channel).toBe('web');
  });

  it('should reject payload with missing data', () => {
    const result = parseSalesIQWebhook({}, 'default');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Missing data');
  });

  it('should reject payload with missing chat.id', () => {
    const payload: SalesIQWebhookPayload = {
      data: {
        visitor: { id: 'v1' },
        message: { text: 'hello' },
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('chat.id');
  });

  it('should reject payload with missing visitor.id', () => {
    const payload: SalesIQWebhookPayload = {
      data: {
        chat: { id: 'c1' },
        message: { text: 'hello' },
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('visitor.id');
  });

  it('should reject payload with missing message text', () => {
    const payload: SalesIQWebhookPayload = {
      data: {
        chat: { id: 'c1' },
        visitor: { id: 'v1' },
        message: {},
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('message text');
  });

  it('should handle attachments', () => {
    const payload: SalesIQWebhookPayload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        message: {
          text: 'See attached',
          attachments: [{ type: 'image', url: 'https://example.com/img.png', name: 'photo.png' }],
        },
      },
    };
    const result = parseSalesIQWebhook(payload, 'default');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.message.attachments).toHaveLength(1);
      expect(result.message.message.attachments![0].type).toBe('image');
    }
  });
});
