import { AgentResponse, ConversationTurn, StructuredMemory, Channel } from '../config/types';
import { promptManager } from './prompt-manager';
import { parseAgentResponse, RESPONSE_CONTRACT_SCHEMA } from './response-contract';
import { toolRegistry } from '../tools/registry';
import { knowledgeService } from '../knowledge/knowledge-service';
import { configService } from '../config/config-service';
import { logger } from '../observability/logger';
import { LLMMessage } from './types';
import { ModelRouter } from '../llm/model-router';
import { LLMCompletionRequest, ModelRoutingContext } from '../llm/types';
import { env } from '../config/env';

/**
 * AgentCore — orchestrates LLM interactions for the Dentalkart chatbot.
 *
 * Responsibilities:
 * - Build the full prompt (system + developer + brand tone + knowledge + tools + context)
 * - Route LLM requests through the ModelRouter (supports multi-provider failover)
 * - Parse structured JSON responses via the response contract
 * - Feed tool results back to the LLM for refined responses
 * - Provide fallback responses when all providers fail
 */
export class AgentCore {
  private router: ModelRouter;

  constructor(router: ModelRouter) {
    this.router = router;
  }

  /**
   * Process a user message through the LLM and return a structured AgentResponse.
   */
  async process(
    userMessage: string,
    conversationHistory: ConversationTurn[],
    structuredMemory: StructuredMemory,
    channel: Channel,
    promptVersion?: string,
    requestId?: string,
    proactiveContext?: string,
    customerContext?: string,
  ): Promise<AgentResponse> {
    const log = logger.child({ component: 'agent-core', requestId });

    // Circuit breaker check (all providers down)
    if (this.router.isFullyOpen()) {
      log.warn('All LLM providers circuit-broken; returning fallback');
      return this.fallbackResponse('Our system is temporarily busy. A team member will assist you shortly.');
    }

    try {
      // Build the prompt (use hybrid search when RAG is enabled)
      const prompts = promptManager.get(promptVersion);
      const knowledgeContext = env.rag.enabled && knowledgeService.isVectorSearchReady
        ? await knowledgeService.buildContextHybrid(userMessage)
        : knowledgeService.buildContext(userMessage);
      const messages = this.buildMessages(prompts, conversationHistory, structuredMemory, userMessage, knowledgeContext, channel, proactiveContext, customerContext);

      // Build routing context
      const routingContext: ModelRoutingContext = {
        conversationId: requestId ?? `req-${Date.now()}`,
        channel,
        requestId,
      };

      // Build completion request
      const request: LLMCompletionRequest = {
        messages,
        temperature: 0.3,
        maxTokens: 2048,
        jsonMode: true,
      };

      // Route to LLM provider (with automatic failover)
      const completion = await this.router.complete(request, routingContext);

      // Parse structured response
      const response = parseAgentResponse(completion.content);

      log.info({
        intent: response.intent,
        shouldEscalate: response.shouldEscalate,
        toolCallCount: response.toolCalls.length,
        provider: completion.provider,
        model: completion.model,
        latencyMs: completion.latencyMs,
        tokens: completion.usage.totalTokens,
      }, 'Agent response generated');

      return response;
    } catch (err) {
      log.error({ err }, 'LLM request failed');
      return this.fallbackResponse(
        "I'm having trouble processing your request right now. Let me connect you with a team member.",
      );
    }
  }

  private buildMessages(
    prompts: { system: string; developer: string; brandTone: string; governance?: string },
    history: ConversationTurn[],
    memory: StructuredMemory,
    userMessage: string,
    knowledgeContext: string,
    channel: Channel,
    proactiveContext?: string,
    customerContext?: string,
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt — identical across all providers.
    // Tool calling is done via JSON in the system prompt, NOT via provider-native
    // function calling. This keeps the tool interface provider-agnostic.
    const systemPrompt = [
      // Governance prompt BEFORE system prompt (Phase 1D)
      prompts.governance ? `--- AI GOVERNANCE ---\n${prompts.governance}\n` : '',
      prompts.system,
      '',
      '--- DEVELOPER INSTRUCTIONS ---',
      prompts.developer,
      '',
      prompts.brandTone ? `--- BRAND TONE ---\n${prompts.brandTone}` : '',
      '',
      '--- RESPONSE FORMAT ---',
      'You MUST respond with a JSON object matching this schema:',
      JSON.stringify(RESPONSE_CONTRACT_SCHEMA, null, 2),
      '',
      '--- CURRENT CONTEXT ---',
      `Channel: ${channel}`,
      `Known visitor info: ${JSON.stringify(memory)}`,
      '',
      knowledgeContext ? `--- KNOWLEDGE BASE ---\n${knowledgeContext}` : '',
      '',
      proactiveContext ?? '',
      '',
      customerContext ? `${customerContext}\n` : '',
      // Enhancement v5: Dynamic Tone Adjustment (B3)
      // Sentiment-based tone instructions injected by orchestrator via customerContext
      // or detected from conversation history
      this.buildDynamicToneContext(history),
      '--- AVAILABLE TOOLS ---',
      'If you need to perform actions, include them in the tool_calls array with the correct args.',
      'Available tools:',
      ...toolRegistry.getAll()
        .filter((t) => configService.isToolEnabled(env.defaultTenantId, t.name, channel))
        .map((t) =>
          `- ${t.name}: ${t.description}\n  Input: ${JSON.stringify(t.inputSchema)}`
        ),
    ].filter(Boolean).join('\n');

    messages.push({ role: 'system', content: systemPrompt });

    // Conversation history (last N turns)
    for (const turn of history) {
      if (turn.role === 'system') continue;
      messages.push({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      });
    }

    // Current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Enhancement v5 (B3): Build dynamic tone context from conversation sentiment.
   * Analyzes recent user messages and injects appropriate tone guidelines.
   */
  private buildDynamicToneContext(history: ConversationTurn[]): string {
    if (!env.dynamicTone?.enabled) return '';

    const userMessages = history
      .filter((t) => t.role === 'user')
      .slice(-5) // Last 5 user messages
      .map((t) => t.content.toLowerCase());

    if (userMessages.length === 0) return '';

    // Simple keyword-based sentiment detection
    const frustrationKeywords = ['angry', 'terrible', 'horrible', 'worst', 'awful', 'hate', 'scam', 'fraud', 'disappointed', 'frustrated', 'ridiculous', 'unacceptable', 'never', 'useless', 'waste'];
    const positiveKeywords = ['thank', 'great', 'excellent', 'perfect', 'awesome', 'good', 'happy', 'love', 'amazing', 'wonderful', 'fantastic'];

    let negScore = 0;
    let posScore = 0;
    for (const msg of userMessages) {
      for (const kw of frustrationKeywords) {
        if (msg.includes(kw)) negScore++;
      }
      for (const kw of positiveKeywords) {
        if (msg.includes(kw)) posScore++;
      }
    }

    const empatheticThreshold = env.dynamicTone?.empatheticThreshold ?? -0.3;
    const positiveThreshold = env.dynamicTone?.positiveThreshold ?? 0.5;
    const sentimentScore = (posScore - negScore) / Math.max(userMessages.length, 1);

    if (sentimentScore <= empatheticThreshold) {
      return [
        '--- CURRENT SENTIMENT CONTEXT ---',
        'DETECTED: Customer appears frustrated or upset (sentiment: negative)',
        'TONE GUIDELINES:',
        '- Acknowledge the customer\'s frustration first before offering solutions',
        '- Use reassuring language: "I completely understand", "I\'m sorry you\'re dealing with this"',
        '- Be specific about next steps — no vague promises',
        '- Avoid defensive language',
        '- Offer concrete alternatives if one solution is not possible',
        '- Keep responses concise — frustrated customers do not want walls of text',
        '',
      ].join('\n');
    }

    if (sentimentScore >= positiveThreshold) {
      return [
        '--- CURRENT SENTIMENT CONTEXT ---',
        'DETECTED: Customer appears happy and engaged (sentiment: positive)',
        'TONE GUIDELINES:',
        '- Match the customer\'s positive energy',
        '- Suggest related products or recommendations — happy customers are receptive',
        '- Celebrate their choices: "Great choice!", "Excellent pick!"',
        '- Share helpful tips about products',
        '- Keep momentum — don\'t slow down a positive interaction',
        '',
      ].join('\n');
    }

    return ''; // Neutral — use default tone
  }

  private fallbackResponse(message: string): AgentResponse {
    return {
      userFacingMessage: message,
      intent: 'error_fallback',
      extractedFields: {},
      shouldEscalate: true,
      escalationReason: 'LLM service unavailable',
      ticketUpdatePayload: {
        status: 'Escalated',
        tags: ['zobot-llm-error'],
      },
      toolCalls: [
        { name: 'handoff_to_human', args: { reason: 'LLM service unavailable', summary: message } },
      ],
    };
  }

  /**
   * Process tool results and generate a refined response.
   * Called after tool execution to feed results back to the LLM
   * so it can present data (orders, tracking, etc.) to the user.
   */
  async processWithToolResults(
    userMessage: string,
    conversationHistory: ConversationTurn[],
    structuredMemory: StructuredMemory,
    channel: Channel,
    toolResults: Array<{ tool: string; success: boolean; data?: unknown; error?: string }>,
    initialAssistantMessage: string,
    promptVersion?: string,
    requestId?: string,
  ): Promise<AgentResponse> {
    const log = logger.child({ component: 'agent-core', requestId, phase: 'tool-results' });

    try {
      // Build system prompt (same as normal process)
      const prompts = promptManager.get(promptVersion);
      const knowledgeContext = knowledgeService.buildContext(userMessage);
      const messages: LLMMessage[] = [];

      const systemPrompt = [
        prompts.system,
        '',
        '--- DEVELOPER INSTRUCTIONS ---',
        prompts.developer,
        '',
        prompts.brandTone ? `--- BRAND TONE ---\n${prompts.brandTone}` : '',
        '',
        '--- RESPONSE FORMAT ---',
        'You MUST respond with a JSON object matching this schema:',
        JSON.stringify(RESPONSE_CONTRACT_SCHEMA, null, 2),
        '',
        '--- CURRENT CONTEXT ---',
        `Channel: ${channel}`,
        `Known visitor info: ${JSON.stringify(structuredMemory)}`,
        '',
        knowledgeContext ? `--- KNOWLEDGE BASE ---\n${knowledgeContext}` : '',
        '',
        '--- AVAILABLE TOOLS ---',
        'Tools are available but do NOT call any tools in this response.',
        'You already executed tools and have the results below.',
      ].filter(Boolean).join('\n');

      messages.push({ role: 'system', content: systemPrompt });

      // Conversation history (excluding the last user message, since we add it below)
      for (const turn of conversationHistory) {
        if (turn.role === 'system') continue;
        messages.push({
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        });
      }

      // Current user message
      messages.push({ role: 'user', content: userMessage });

      // Assistant's initial response (before tool execution)
      messages.push({ role: 'assistant', content: initialAssistantMessage });

      // Tool results as a follow-up context
      const toolResultsStr = toolResults.map((tr) => {
        if (tr.success && tr.data) {
          return `✅ ${tr.tool} succeeded:\n${JSON.stringify(tr.data, null, 2)}`;
        }
        return `❌ ${tr.tool} failed: ${tr.error ?? 'Unknown error'}`;
      }).join('\n\n');

      messages.push({
        role: 'user',
        content: [
          '[TOOL EXECUTION RESULTS — Present this data to the customer]',
          toolResultsStr,
          '',
          'INSTRUCTIONS:',
          '- Provide your FINAL response incorporating the tool results above.',
          '- Present order information clearly with order numbers, dates, status, amounts, items, and payment method.',
          '- If there are multiple orders, list them all concisely.',
          '- Do NOT include any tool_calls — tools have already been executed.',
          '- Keep tool_calls as an empty array [].',
          '- Be helpful and conversational.',
        ].join('\n'),
      });

      // Routing context
      const routingContext: ModelRoutingContext = {
        conversationId: requestId ?? `req-${Date.now()}`,
        channel,
        requestId,
      };

      // Second LLM call with increased token budget for data presentation
      const request: LLMCompletionRequest = {
        messages,
        temperature: 0.3,
        maxTokens: 4096,
        jsonMode: true,
      };

      const completion = await this.router.complete(request, routingContext);

      const response = parseAgentResponse(completion.content);
      // Force-clear tool calls to prevent infinite loops
      response.toolCalls = [];

      log.info({
        intent: response.intent,
        toolCount: toolResults.length,
        messageLength: response.userFacingMessage.length,
        provider: completion.provider,
        model: completion.model,
        latencyMs: completion.latencyMs,
      }, 'Tool results processed and response generated');

      return response;
    } catch (err) {
      log.error({ err }, 'Failed to process tool results');

      // Fallback: build a basic response from the raw tool data itself
      return this.buildToolResultsFallback(toolResults);
    }
  }

  /**
   * Build a fallback response from raw tool results when the LLM fails.
   */
  private buildToolResultsFallback(
    toolResults: Array<{ tool: string; success: boolean; data?: unknown; error?: string }>,
  ): AgentResponse {
    const parts: string[] = [];
    let detectedIntent = 'general';

    for (const tr of toolResults) {
      if (!tr.success) {
        // Surface the tool's own user-friendly error message
        parts.push(tr.error ?? 'Sorry, I encountered an issue processing your request.');
        continue;
      }
      const data = tr.data as Record<string, unknown> | undefined;
      if (!data) continue;

      if (tr.tool === 'lookup_customer_orders' && data.found && Array.isArray(data.orders)) {
        detectedIntent = 'order_status';
        const orders = data.orders as Array<Record<string, unknown>>;
        parts.push(`Found ${orders.length} order(s) for ${data.customerName ?? 'you'}:`);
        for (const o of orders.slice(0, 5)) {
          const items = Array.isArray(o.items) ? (o.items as Array<Record<string, unknown>>).map(i => i.name).join(', ') : '';
          parts.push(`• ${o.orderNo} — ${o.status} — ₹${o.totalAmount} — ${items}`);
        }
        if (orders.length > 5) parts.push(`...and ${orders.length - 5} more.`);
      }

      if (tr.tool === 'start_ar_demo' && data.sessionStarted && data.customerJoinUrl) {
        detectedIntent = 'product_demo_request';
        parts.push(String(data.message ?? 'Your AR demo session is ready.'));
        parts.push(`\n🔗 Join here: ${data.customerJoinUrl}`);
        if (data.instructions) parts.push(`\n📋 ${data.instructions}`);
      }
    }

    return {
      userFacingMessage: parts.length > 0 ? parts.join('\n') : 'I retrieved your information but had trouble formatting it. Please try again.',
      intent: detectedIntent,
      extractedFields: {},
      shouldEscalate: false,
      ticketUpdatePayload: {},
      toolCalls: [],
    };
  }

  /**
   * Health check across all configured LLM providers.
   */
  async healthCheck(): Promise<Record<string, { status: string; latencyMs: number }>> {
    return this.router.healthCheck();
  }
}
