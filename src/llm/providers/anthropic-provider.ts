import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '../types';
import { LLMMessage } from '../../agent/types';
import { logger } from '../../observability/logger';

/**
 * Anthropic Claude provider adapter.
 *
 * Key differences from OpenAI:
 * 1. System message is passed as a separate `system` parameter, NOT in the messages array.
 * 2. Messages must strictly alternate user/assistant. Consecutive same-role messages are merged.
 * 3. JSON mode: we prefill the assistant response with `{` to force JSON output.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private client: Anthropic;
  private timeoutMs: number;
  private log = logger.child({ component: 'anthropic-provider' });

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
    });
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();

    // 1. Extract system message(s) — Claude takes them as a separate param
    let systemPrompt = '';
    const nonSystemMessages: LLMMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
      } else {
        nonSystemMessages.push(msg);
      }
    }

    // 2. Ensure strict user/assistant alternation — merge consecutive same-role messages
    const mergedMessages = this.mergeConsecutiveRoles(nonSystemMessages);

    // 3. Build Claude messages
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      mergedMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Ensure first message is from 'user' (Claude requirement)
    if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
      claudeMessages.unshift({ role: 'user', content: '(conversation start)' });
    }

    // 4. For JSON mode, add instruction to system prompt and prefill assistant
    if (request.jsonMode) {
      systemPrompt +=
        '\n\nCRITICAL: You must respond with valid JSON only. No markdown fences, no preamble, no explanation outside the JSON. Start your response with {';
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: systemPrompt || undefined,
      messages: claudeMessages,
    });

    // 5. Extract text content
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Anthropic returned no text content');
    }

    let content = textBlock.text;

    // If we prefilled with `{` and the response doesn't start with it, prepend
    if (request.jsonMode && !content.trimStart().startsWith('{')) {
      content = '{' + content;
    }

    return {
      content,
      model: response.model ?? this.model,
      provider: 'anthropic',
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      latencyMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple lightweight check — send a tiny message
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return response.content.length > 0;
    } catch (err) {
      this.log.warn({ err }, 'Anthropic health check failed');
      return false;
    }
  }

  /**
   * Merge consecutive same-role messages into single messages.
   * Claude requires strict alternation of user/assistant roles.
   */
  private mergeConsecutiveRoles(messages: LLMMessage[]): LLMMessage[] {
    if (messages.length === 0) return [];

    const merged: LLMMessage[] = [{ ...messages[0] }];

    for (let i = 1; i < messages.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = messages[i];

      if (curr.role === prev.role) {
        // Merge into previous message
        prev.content += '\n\n' + curr.content;
      } else {
        merged.push({ ...curr });
      }
    }

    return merged;
  }
}
