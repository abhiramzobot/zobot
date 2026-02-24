import { LLMMessage } from '../agent/types';

// ─── Provider Names ───────────────────────────────────────────────
export type LLMProviderName = 'openai' | 'anthropic' | 'gemini';

// ─── Routing Strategy ─────────────────────────────────────────────
export type RoutingStrategy = 'config' | 'intent' | 'ab_test';

// ─── Provider Configuration ───────────────────────────────────────
export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

// ─── Completion Request / Response ────────────────────────────────
export interface LLMCompletionRequest {
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
  /** Hint providers to produce JSON output */
  jsonMode: boolean;
}

export interface LLMTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMCompletionResponse {
  /** Raw text from the model (must be JSON-parseable when jsonMode was true) */
  content: string;
  /** Actual model identifier returned by the provider */
  model: string;
  /** Which provider served the request */
  provider: LLMProviderName;
  /** Token usage for cost tracking */
  usage: LLMTokenUsage;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
}

// ─── Provider Interface ───────────────────────────────────────────
export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;

  /**
   * Send a completion request and return the response.
   * Implementations must map our generic message format to provider-specific APIs.
   */
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;

  /**
   * Lightweight connectivity check.
   * Returns true if the provider is reachable, false otherwise.
   */
  healthCheck(): Promise<boolean>;
}

// ─── Model Router Configuration ───────────────────────────────────
export interface ModelRouterConfig {
  primaryProvider: LLMProviderName;
  secondaryProvider?: LLMProviderName;
  tertiaryProvider?: LLMProviderName;
  strategy: RoutingStrategy;
  /** Percentage of traffic for primary in A/B test (0–100) */
  abTestSplit: number;
  /** Intent → provider overrides for intent-based routing */
  intentRouting?: Record<string, LLMProviderName>;
}

// ─── Routing Context ──────────────────────────────────────────────
export interface ModelRoutingContext {
  conversationId: string;
  intent?: string;
  channel: string;
  requestId?: string;
}
