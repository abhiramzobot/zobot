import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '../types';
import { LLMMessage } from '../../agent/types';
import { logger } from '../../observability/logger';

/**
 * Google Gemini provider adapter.
 *
 * Key differences from OpenAI:
 * 1. System instruction is a separate parameter, not in the messages array.
 * 2. Role mapping: 'assistant' → 'model', 'user' stays 'user'.
 * 3. JSON mode via `generationConfig: { responseMimeType: 'application/json' }`.
 * 4. Messages use `parts: [{ text }]` format instead of `content` string.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;
  readonly model: string;
  private genAI: GoogleGenerativeAI;
  private config: LLMProviderConfig;
  private log = logger.child({ component: 'gemini-provider' });

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();

    // 1. Extract system message(s) — Gemini takes them as systemInstruction
    let systemInstruction = '';
    const nonSystemMessages: LLMMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
      } else {
        nonSystemMessages.push(msg);
      }
    }

    // 2. Map messages to Gemini Content format
    const contents: Content[] = this.buildContents(nonSystemMessages);

    // 3. Create model with configuration
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemInstruction || undefined,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });

    // 4. Generate content
    const result = await model.generateContent({ contents });
    const response = result.response;
    const content = response.text();

    if (!content) {
      throw new Error('Gemini returned empty response');
    }

    // 5. Extract usage metadata
    const usageMetadata = response.usageMetadata;

    return {
      content,
      model: this.model,
      provider: 'gemini',
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      },
      latencyMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent('ping');
      return !!result.response.text();
    } catch (err) {
      this.log.warn({ err }, 'Gemini health check failed');
      return false;
    }
  }

  /**
   * Convert our LLMMessage[] to Gemini's Content[] format.
   * Gemini uses 'user' and 'model' roles with parts: [{ text }].
   * Consecutive same-role messages are merged.
   */
  private buildContents(messages: LLMMessage[]): Content[] {
    if (messages.length === 0) return [];

    const contents: Content[] = [];
    let currentRole = '';
    let currentParts: string[] = [];

    for (const msg of messages) {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

      if (geminiRole === currentRole) {
        // Merge consecutive same-role
        currentParts.push(msg.content);
      } else {
        // Flush previous
        if (currentRole && currentParts.length > 0) {
          contents.push({
            role: currentRole,
            parts: [{ text: currentParts.join('\n\n') }],
          });
        }
        currentRole = geminiRole;
        currentParts = [msg.content];
      }
    }

    // Flush last
    if (currentRole && currentParts.length > 0) {
      contents.push({
        role: currentRole,
        parts: [{ text: currentParts.join('\n\n') }],
      });
    }

    // Gemini requires first message to be 'user'
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({
        role: 'user',
        parts: [{ text: '(conversation start)' }],
      });
    }

    return contents;
  }
}
