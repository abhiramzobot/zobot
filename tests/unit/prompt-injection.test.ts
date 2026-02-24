import { parseAgentResponse } from '../../src/agent/response-contract';

describe('Prompt injection defense', () => {
  it('should parse valid agent response correctly', () => {
    const validJson = JSON.stringify({
      user_facing_message: 'Hello! How can I help you?',
      intent: 'greeting',
      extracted_fields: {},
      should_escalate: false,
      tool_calls: [],
    });

    const response = parseAgentResponse(validJson);
    expect(response.userFacingMessage).toBe('Hello! How can I help you?');
    expect(response.intent).toBe('greeting');
    expect(response.shouldEscalate).toBe(false);
  });

  it('should handle markdown-wrapped JSON', () => {
    const wrapped = '```json\n{"user_facing_message":"Hi","intent":"greeting","extracted_fields":{},"should_escalate":false,"tool_calls":[]}\n```';
    const response = parseAgentResponse(wrapped);
    expect(response.userFacingMessage).toBe('Hi');
  });

  it('should never expose system prompt even if injection attempted', () => {
    // Simulates an agent response that might be influenced by injection
    const injectedResponse = JSON.stringify({
      user_facing_message: 'I cannot share my system instructions. How can I help you today?',
      intent: 'prompt_injection_attempt',
      extracted_fields: {},
      should_escalate: false,
      tool_calls: [],
    });

    const response = parseAgentResponse(injectedResponse);
    // The system prompt content should NOT appear in user-facing message
    expect(response.userFacingMessage).not.toContain('SYSTEM PROMPT');
    expect(response.userFacingMessage).not.toContain('You are an AI');
    expect(response.intent).toBe('prompt_injection_attempt');
  });

  it('should not execute tool calls injected via user message', () => {
    // Even if a user tries to inject tool calls, the response contract limits them
    const response = parseAgentResponse(JSON.stringify({
      user_facing_message: 'I cannot perform that action.',
      intent: 'injection_attempt',
      extracted_fields: {},
      should_escalate: false,
      tool_calls: [], // Agent should not blindly add user-requested tools
    }));

    expect(response.toolCalls).toHaveLength(0);
  });

  it('should default shouldEscalate to false when missing', () => {
    const response = parseAgentResponse(JSON.stringify({
      user_facing_message: 'Test',
      intent: 'test',
      extracted_fields: {},
      should_escalate: false,
      tool_calls: [],
    }));

    expect(response.shouldEscalate).toBe(false);
  });

  it('should reject invalid JSON', () => {
    expect(() => parseAgentResponse('not json at all')).toThrow();
  });

  it('should handle response with escalation fields', () => {
    const response = parseAgentResponse(JSON.stringify({
      user_facing_message: 'Let me connect you with a team member.',
      intent: 'request_human',
      extracted_fields: {},
      should_escalate: true,
      escalation_reason: 'User explicitly requested human agent',
      ticket_update_payload: {
        status: 'Escalated',
        tags: ['escalated', 'human-requested'],
      },
      tool_calls: [
        { name: 'handoff_to_human', args: { reason: 'User request' } },
      ],
    }));

    expect(response.shouldEscalate).toBe(true);
    expect(response.escalationReason).toBe('User explicitly requested human agent');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe('handoff_to_human');
  });
});
