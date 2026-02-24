import OpenAI from 'openai';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '../types';
import { logger } from '../../observability/logger';

const MAX_RETRIES = 2;

/**
 * OpenAI provider adapter.
 *
 * Wraps the existing `openai` SDK and maps our generic request/response
 * format to OpenAI's chat completions API.
 *
 * JSON mode is handled via `response_format: { type: 'json_object' }`.
 * Tool calling is NOT done via native function calling — tools are embedded
 * as JSON in the system prompt (project convention).
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  private client: OpenAI;
  private log = logger.child({ component: 'openai-provider' });

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: MAX_RETRIES,
    });
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response content');
    }

    const usage = completion.usage;

    return {
      content,
      model: completion.model ?? this.model,
      provider: 'openai',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (err) {
      this.log.warn({ err }, 'OpenAI health check failed');
      return false;
    }
  }
}
