/**
 * LLM Cost Limiter (Phase 4F)
 *
 * Layer 3: max tokens/conversation, daily budget per tenant.
 */

import { logger } from '../observability/logger';

interface CostLimits {
  maxTokensPerConversation: number;
  dailyBudgetPerTenant: number; // in USD
}

const DEFAULT_LIMITS: CostLimits = {
  maxTokensPerConversation: 50_000,
  dailyBudgetPerTenant: 100,
};

// Approximate cost per 1K tokens (blended input/output)
const COST_PER_1K_TOKENS: Record<string, number> = {
  openai: 0.003,
  anthropic: 0.008,
  gemini: 0.001,
};

export class LLMCostLimiter {
  private readonly conversationTokens = new Map<string, number>();
  private readonly tenantDailyCost = new Map<string, { cost: number; date: string }>();
  private readonly log = logger.child({ component: 'llm-cost-limiter' });

  constructor(private readonly limits: CostLimits = DEFAULT_LIMITS) {}

  /** Record token usage */
  recordUsage(conversationId: string, tenantId: string, tokens: number, provider: string): void {
    // Track per-conversation tokens
    const current = this.conversationTokens.get(conversationId) ?? 0;
    this.conversationTokens.set(conversationId, current + tokens);

    // Track per-tenant daily cost
    const today = new Date().toISOString().split('T')[0];
    const tenantEntry = this.tenantDailyCost.get(tenantId);
    const costPerToken = (COST_PER_1K_TOKENS[provider] ?? 0.005) / 1000;
    const addedCost = tokens * costPerToken;

    if (!tenantEntry || tenantEntry.date !== today) {
      this.tenantDailyCost.set(tenantId, { cost: addedCost, date: today });
    } else {
      tenantEntry.cost += addedCost;
    }
  }

  /** Check if conversation can make another LLM call */
  canMakeRequest(conversationId: string, tenantId: string): { allowed: boolean; reason?: string } {
    // Check conversation token limit
    const convTokens = this.conversationTokens.get(conversationId) ?? 0;
    if (convTokens >= this.limits.maxTokensPerConversation) {
      return { allowed: false, reason: `Conversation token limit exceeded (${convTokens}/${this.limits.maxTokensPerConversation})` };
    }

    // Check tenant daily budget
    const today = new Date().toISOString().split('T')[0];
    const tenantEntry = this.tenantDailyCost.get(tenantId);
    if (tenantEntry && tenantEntry.date === today && tenantEntry.cost >= this.limits.dailyBudgetPerTenant) {
      return { allowed: false, reason: `Tenant daily budget exceeded ($${tenantEntry.cost.toFixed(2)}/$${this.limits.dailyBudgetPerTenant})` };
    }

    return { allowed: true };
  }

  /** Get cost summary for a tenant */
  getTenantCost(tenantId: string): { dailyCost: number; date: string } {
    const entry = this.tenantDailyCost.get(tenantId);
    return { dailyCost: entry?.cost ?? 0, date: entry?.date ?? new Date().toISOString().split('T')[0] };
  }
}
