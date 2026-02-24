import { InMemoryConversationStore } from '../../src/memory/conversation-memory';
import { MockTicketingService } from '../../src/ticketing/mock-ticketing';
import { ChannelOutbound } from '../../src/channels/types';
import { Orchestrator } from '../../src/orchestrator/orchestrator';
import { registerBuiltinTools } from '../../src/tools/registry';
import { createTraceContext } from '../../src/observability/trace';
import { InboundMessage } from '../../src/config/types';

// Mock OpenAI to avoid actual API calls
jest.mock('../../src/agent/agent-core', () => ({
  agentCore: {
    process: jest.fn().mockImplementation(async () => ({
      userFacingMessage: 'Hello! How can I help you today?',
      intent: 'greeting',
      confidenceScore: 0.95,
      extractedFields: { name: 'John Doe' },
      shouldEscalate: false,
      ticketUpdatePayload: {
        summary: 'New visitor greeted',
        tags: ['greeting'],
        status: 'Open',
        intentClassification: 'greeting',
      },
      toolCalls: [],
    })),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let store: InMemoryConversationStore;
  let ticketing: MockTicketingService;
  let outbound: jest.Mocked<ChannelOutbound>;

  const makeInbound = (overrides?: Partial<InboundMessage>): InboundMessage => ({
    channel: 'web',
    conversationId: 'conv-test-1',
    visitorId: 'visitor-1',
    userProfile: { name: 'John Doe' },
    message: { text: 'Hello' },
    timestamp: Date.now(),
    tenantId: 'default',
    ...overrides,
  });

  beforeAll(() => {
    registerBuiltinTools();
  });

  beforeEach(() => {
    store = new InMemoryConversationStore();
    ticketing = new MockTicketingService();
    outbound = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      escalateToHuman: jest.fn().mockResolvedValue(undefined),
      addTags: jest.fn().mockResolvedValue(undefined),
      setDepartment: jest.fn().mockResolvedValue(undefined),
    };
    orchestrator = new Orchestrator(store, ticketing, outbound, (jest.requireMock('../../src/agent/agent-core') as any).agentCore);
  });

  it('should create a ticket on first message (NEW state)', async () => {
    const inbound = makeInbound();
    const trace = createTraceContext({ conversationId: inbound.conversationId });

    await orchestrator.handleMessage(inbound, trace);

    // Verify ticket was created
    const tickets = ticketing.getAllTickets();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].conversationId).toBe('conv-test-1');
    expect(tickets[0].channel).toBe('web');
    expect(tickets[0].subject).toContain('Chat - web - visitor-1');
  });

  it('should send typing indicator before processing', async () => {
    const inbound = makeInbound();
    const trace = createTraceContext();

    await orchestrator.handleMessage(inbound, trace);

    expect(outbound.sendTyping).toHaveBeenCalledWith('conv-test-1', 'web');
  });

  it('should send the agent response back to the user', async () => {
    const inbound = makeInbound();
    const trace = createTraceContext();

    await orchestrator.handleMessage(inbound, trace);

    expect(outbound.sendMessage).toHaveBeenCalledWith(
      'conv-test-1',
      'Hello! How can I help you today?',
      'web',
    );
  });

  it('should persist conversation state', async () => {
    const inbound = makeInbound();
    const trace = createTraceContext();

    await orchestrator.handleMessage(inbound, trace);

    const record = await store.get('conv-test-1');
    expect(record).not.toBeNull();
    expect(record!.state).toBe('ACTIVE_QA'); // NEW -> ACTIVE_QA for greeting
    expect(record!.turns).toHaveLength(2); // user + assistant
    expect(record!.structuredMemory.name).toBe('John Doe');
  });

  it('should update ticket on subsequent messages', async () => {
    const inbound = makeInbound();
    const trace1 = createTraceContext();
    await orchestrator.handleMessage(inbound, trace1);

    // Second message
    const inbound2 = makeInbound({ message: { text: 'Tell me about pricing' } });
    const trace2 = createTraceContext();
    await orchestrator.handleMessage(inbound2, trace2);

    const tickets = ticketing.getAllTickets();
    expect(tickets).toHaveLength(1); // Same ticket, updated
    expect(tickets[0].summary).toBe('New visitor greeted');
  });

  it('should not create duplicate tickets for same conversation', async () => {
    const inbound1 = makeInbound();
    const inbound2 = makeInbound({ message: { text: 'Second message' } });

    await orchestrator.handleMessage(inbound1, createTraceContext());
    await orchestrator.handleMessage(inbound2, createTraceContext());

    expect(ticketing.getAllTickets()).toHaveLength(1);
  });
});
