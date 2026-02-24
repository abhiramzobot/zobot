/**
 * Customer 360 Profile Loader (Phase 3A)
 *
 * Fetches from OMS + internal stores, caches per conversation.
 */

import { CustomerProfile, PersonalizationRule, Customer360Config } from './types';
import { CacheStore } from '../cache/types';
import { logger } from '../observability/logger';

const DEFAULT_CONFIG: Customer360Config = {
  enabled: false,
  cacheTtlSeconds: 300,
  vipDetection: true,
  vipLtvThreshold: 50000,
};

export class ProfileLoader {
  private readonly log = logger.child({ component: 'customer360' });

  constructor(
    private readonly cache: CacheStore,
    private readonly config: Customer360Config = DEFAULT_CONFIG,
  ) {}

  async loadProfile(customerId: string, phone?: string, email?: string): Promise<CustomerProfile | null> {
    if (!this.config.enabled) return null;

    // Check cache first
    const cacheKey = `c360:${customerId}`;
    const cached = await this.cache.get<CustomerProfile>(cacheKey);
    if (cached) {
      this.log.debug({ customerId }, 'Customer 360 cache hit');
      return cached;
    }

    try {
      // In production: fetch from VineRetail API + internal stores
      // For now, build a mock profile
      const profile = await this.fetchFromSources(customerId, phone, email);

      if (profile) {
        // Apply personalization rules
        profile.personalizations = this.computePersonalizations(profile);
        // Cache
        await this.cache.set(cacheKey, profile, this.config.cacheTtlSeconds);
      }

      return profile;
    } catch (err) {
      this.log.warn({ err, customerId }, 'Customer 360 profile load failed');
      return null;
    }
  }

  /** Format profile as prompt context */
  formatForPrompt(profile: CustomerProfile): string {
    const lines: string[] = [
      '--- CUSTOMER CONTEXT ---',
      `Customer Segment: ${profile.segment.toUpperCase()}`,
      `Lifetime Value: ₹${profile.ltv.toLocaleString()}`,
      `Total Orders: ${profile.totalOrders}`,
      `Return Rate: ${profile.returnRate}%`,
      `Avg CSAT: ${profile.avgCsat}/5`,
    ];

    if (profile.lastOrderDate) {
      lines.push(`Last Order: ${profile.lastOrderDate}`);
    }

    if (profile.activeIssues > 0) {
      lines.push(`⚠️ Active Issues: ${profile.activeIssues}`);
    }

    if (profile.personalizations.length > 0) {
      lines.push('Personalization Notes:');
      for (const rule of profile.personalizations) {
        lines.push(`  • ${rule.action}`);
      }
    }

    return lines.join('\n');
  }

  private async fetchFromSources(customerId: string, _phone?: string, _email?: string): Promise<CustomerProfile> {
    // Mock implementation — replace with real API calls
    return {
      customerId,
      segment: 'regular',
      ltv: 5000,
      totalOrders: 3,
      returnRate: 10,
      avgCsat: 4.0,
      productCategories: [],
      activeIssues: 0,
      conversationCount: 1,
      personalizations: [],
      loadedAt: Date.now(),
    };
  }

  private computePersonalizations(profile: CustomerProfile): PersonalizationRule[] {
    const rules: PersonalizationRule[] = [];

    if (profile.segment === 'vip' || profile.ltv > this.config.vipLtvThreshold) {
      rules.push({
        id: 'vip_support',
        condition: 'VIP customer',
        action: 'Provide premium support with priority resolution. Address by name. Offer expedited solutions.',
        priority: 1,
      });
    }

    if (profile.returnRate > 20) {
      rules.push({
        id: 'high_return',
        condition: 'High return rate',
        action: 'Be extra careful with product recommendations. Confirm specifications before suggesting products.',
        priority: 2,
      });
    }

    if (profile.activeIssues > 0) {
      rules.push({
        id: 'active_issues',
        condition: 'Has active issues',
        action: 'Check if the customer is following up on an existing issue before creating a new one.',
        priority: 1,
      });
    }

    if (profile.segment === 'at_risk') {
      rules.push({
        id: 'retention_focus',
        condition: 'At-risk customer',
        action: 'Focus on resolution and retention. Be empathetic. Offer goodwill gestures if appropriate.',
        priority: 1,
      });
    }

    return rules;
  }
}
