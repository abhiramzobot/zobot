import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

// Mock OpenAI to avoid real API calls
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                user_facing_message: 'Hello! Welcome. How can I help you?',
                intent: 'greeting',
                extracted_fields: {},
                should_escalate: false,
                ticket_update_payload: {
                  summary: 'Visitor greeted',
                  tags: ['greeting'],
                  status: 'Open',
                  intent_classification: 'greeting',
                },
                tool_calls: [],
              }),
            },
          }],
        }),
      },
    },
    models: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  }));
});

describe('Webhook Integration Flow', () => {
  let app: FastifyInstance;

  let adminKey: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'sk-test';
    adminKey = process.env.ADMIN_API_KEY || 'test-admin-key';
    const result = await buildApp();
    app = result.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /webhooks/salesiq', () => {
    const validPayload = {
      event: 'chat.message',
      data: {
        chat: { id: 'integration-chat-1', channel: 'whatsapp' },
        visitor: {
          id: 'integration-visitor-1',
          name: 'Test User',
          email: 'test@example.com',
        },
        message: { text: 'Hello, I need help' },
      },
    };

    it('should accept a valid webhook and return 200', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/salesiq',
        payload: validPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('accepted');
      expect(body.requestId).toBeDefined();
    });

    it('should reject malformed payload with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/salesiq',
        payload: { event: 'test' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject empty payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/salesiq',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Health endpoints', () => {
    it('GET /health should return 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('Admin endpoints', () => {
    it('POST /admin/reload-config should require auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /admin/reload-config should work with correct key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/reload-config',
        headers: { 'x-admin-api-key': adminKey },
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /admin/config/:tenantId should return redacted config', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/config/default',
        headers: { 'x-admin-api-key': adminKey },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.tenantId).toBe('default');
      expect(body.enabledTools).toBeDefined();
    });
  });
});
