import { LLMProvider, LLMProviderName, LLMProviderConfig } from './types';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { logger } from '../observability/logger';

/**
 * Create a single LLM provider by name.
 */
export function createProvider(name: LLMProviderName, config: LLMProviderConfig): LLMProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

/**
 * Build all configured providers from environment configuration.
 * Only creates providers whose API keys are set.
 */
export function buildProviders(envConfig: {
  openai: { apiKey: string; model: string; maxTokens: number; temperature: number; timeoutMs: number };
  anthropic: { apiKey: string; model: string; maxTokens: number; temperature: number; timeoutMs: number };
  gemini: { apiKey: string; model: string; maxTokens: number; temperature: number; timeoutMs: number };
}): Map<LLMProviderName, LLMProvider> {
  const providers = new Map<LLMProviderName, LLMProvider>();
  const log = logger.child({ component: 'provider-factory' });

  // OpenAI
  if (envConfig.openai.apiKey) {
    providers.set('openai', createProvider('openai', envConfig.openai));
    log.info({ model: envConfig.openai.model }, 'OpenAI provider initialized');
  }

  // Anthropic Claude
  if (envConfig.anthropic.apiKey) {
    providers.set('anthropic', createProvider('anthropic', envConfig.anthropic));
    log.info({ model: envConfig.anthropic.model }, 'Anthropic provider initialized');
  }

  // Google Gemini
  if (envConfig.gemini.apiKey) {
    providers.set('gemini', createProvider('gemini', envConfig.gemini));
    log.info({ model: envConfig.gemini.model }, 'Gemini provider initialized');
  }

  if (providers.size === 0) {
    throw new Error(
      'No LLM providers configured. Set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY',
    );
  }

  log.info({ providers: Array.from(providers.keys()) }, `${providers.size} LLM provider(s) initialized`);
  return providers;
}
