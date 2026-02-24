import {
  LLMProvider,
  LLMProviderName,
  LLMCompletionRequest,
  LLMCompletionResponse,
  ModelRouterConfig,
  ModelRoutingContext,
} from './types';
import { logger } from '../observability/logger';
import { llmRequestDuration, llmProviderFailovers, llmTokenUsage } from '../observability/metrics';

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;

interface CircuitBreakerState {
  failures: number;
  openUntil: number;
}

/**
 * Model Router — decides which LLM provider handles each request.
 *
 * Supports three routing strategies:
 * - **config**: Always uses the primary provider (simplest, default)
 * - **intent**: Routes specific intents to specific providers
 * - **ab_test**: Deterministic hash-based split for comparing providers
 *
 * Includes per-provider circuit breakers and automatic failover.
 */
export class ModelRouter {
  private providers: Map<LLMProviderName, LLMProvider>;
  private config: ModelRouterConfig;
  private circuitBreakers: Map<LLMProviderName, CircuitBreakerState>;
  private log = logger.child({ component: 'model-router' });

  constructor(config: ModelRouterConfig, providers: Map<LLMProviderName, LLMProvider>) {
    this.config = config;
    this.providers = providers;
    this.circuitBreakers = new Map();

    // Validate primary provider exists
    if (!providers.has(config.primaryProvider)) {
      throw new Error(
        `Primary provider "${config.primaryProvider}" not available. ` +
        `Configured providers: ${Array.from(providers.keys()).join(', ')}`,
      );
    }

    this.log.info({
      primary: config.primaryProvider,
      secondary: config.secondaryProvider,
      tertiary: config.tertiaryProvider,
      strategy: config.strategy,
      availableProviders: Array.from(providers.keys()),
    }, 'Model router initialized');
  }

  /**
   * Route a completion request to the appropriate provider(s) with failover.
   */
  async complete(
    request: LLMCompletionRequest,
    context: ModelRoutingContext,
  ): Promise<LLMCompletionResponse> {
    const providerOrder = this.resolveProviderOrder(context);
    let lastError: Error | undefined;

    for (let i = 0; i < providerOrder.length; i++) {
      const providerName = providerOrder[i];
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      // Check circuit breaker
      const cb = this.circuitBreakers.get(providerName);
      if (cb && Date.now() < cb.openUntil) {
        this.log.debug({ provider: providerName }, 'Circuit breaker open, skipping');
        continue;
      }

      const timer = llmRequestDuration.startTimer({
        provider: providerName,
        model: provider.model,
      });

      try {
        const response = await provider.complete(request);

        // Success — reset circuit breaker
        this.resetCircuitBreaker(providerName);
        timer({ status: 'success' });

        // Track token usage
        llmTokenUsage.inc(
          { provider: providerName, model: response.model, token_type: 'prompt' },
          response.usage.promptTokens,
        );
        llmTokenUsage.inc(
          { provider: providerName, model: response.model, token_type: 'completion' },
          response.usage.completionTokens,
        );

        // If this was a failover, log it
        if (i > 0) {
          const failedProvider = providerOrder[i - 1];
          llmProviderFailovers.inc({
            from_provider: failedProvider,
            to_provider: providerName,
            reason: 'error',
          });
          this.log.info(
            { from: failedProvider, to: providerName },
            'Successful failover to secondary provider',
          );
        }

        return response;
      } catch (err) {
        timer({ status: 'error' });
        this.recordFailure(providerName);
        lastError = err instanceof Error ? err : new Error(String(err));

        this.log.warn(
          { provider: providerName, err: lastError.message, attempt: i + 1, total: providerOrder.length },
          'Provider failed, trying next',
        );
        continue;
      }
    }

    // All providers failed
    throw new Error(
      `All LLM providers failed. Last error: ${lastError?.message ?? 'unknown'}`,
    );
  }

  /**
   * Health check across all configured providers.
   */
  async healthCheck(): Promise<Record<string, { status: string; latencyMs: number }>> {
    const results: Record<string, { status: string; latencyMs: number }> = {};

    for (const [name, provider] of this.providers) {
      const start = Date.now();
      try {
        const healthy = await provider.healthCheck();
        results[name] = {
          status: healthy ? 'ok' : 'error',
          latencyMs: Date.now() - start,
        };
      } catch {
        results[name] = {
          status: 'error',
          latencyMs: Date.now() - start,
        };
      }
    }

    return results;
  }

  /**
   * Check if the circuit breaker is open for ALL providers (complete outage).
   */
  isFullyOpen(): boolean {
    const now = Date.now();
    for (const [name] of this.providers) {
      const cb = this.circuitBreakers.get(name);
      if (!cb || now >= cb.openUntil) return false;
    }
    return true;
  }

  /**
   * Get the primary provider name.
   */
  get primaryProviderName(): LLMProviderName {
    return this.config.primaryProvider;
  }

  // ─── Private ──────────────────────────────────────────────────

  /**
   * Determine the ordered list of providers to try for this request.
   */
  private resolveProviderOrder(context: ModelRoutingContext): LLMProviderName[] {
    const order: LLMProviderName[] = [];

    switch (this.config.strategy) {
      case 'intent': {
        // Check if the intent has a specific provider mapping
        if (context.intent && this.config.intentRouting?.[context.intent]) {
          const intentProvider = this.config.intentRouting[context.intent];
          if (this.providers.has(intentProvider)) {
            order.push(intentProvider);
          }
        }
        break;
      }

      case 'ab_test': {
        // Deterministic split based on conversationId hash
        const hash = this.simpleHash(context.conversationId);
        const bucket = hash % 100;
        const split = this.config.abTestSplit;

        if (bucket < split) {
          order.push(this.config.primaryProvider);
          if (this.config.secondaryProvider) order.push(this.config.secondaryProvider);
        } else {
          if (this.config.secondaryProvider) order.push(this.config.secondaryProvider);
          order.push(this.config.primaryProvider);
        }
        break;
      }

      case 'config':
      default:
        // Simple priority chain
        break;
    }

    // Always ensure the full failover chain is present
    if (!order.includes(this.config.primaryProvider)) {
      order.push(this.config.primaryProvider);
    }
    if (this.config.secondaryProvider && !order.includes(this.config.secondaryProvider)) {
      order.push(this.config.secondaryProvider);
    }
    if (this.config.tertiaryProvider && !order.includes(this.config.tertiaryProvider)) {
      order.push(this.config.tertiaryProvider);
    }

    return order;
  }

  private recordFailure(provider: LLMProviderName): void {
    const cb = this.circuitBreakers.get(provider) ?? { failures: 0, openUntil: 0 };
    cb.failures++;

    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.openUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
      this.log.error(
        { provider, failures: cb.failures, resetMs: CIRCUIT_BREAKER_RESET_MS },
        'Circuit breaker opened for provider',
      );
    }

    this.circuitBreakers.set(provider, cb);
  }

  private resetCircuitBreaker(provider: LLMProviderName): void {
    const cb = this.circuitBreakers.get(provider);
    if (cb) {
      cb.failures = 0;
      cb.openUntil = 0;
    }
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
