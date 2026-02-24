/**
 * AI Product Recommendation Engine (Enhancement v5 — A4)
 *
 * Rule-based + semantic matching engine.
 * Strategies:
 *   1. Category-based complementary (dental mirror → sterilization pouch)
 *   2. Tier pricing upsell (1pc → bulk pack)
 *   3. Frequently bought together
 *   4. Trending in category
 */

import { logger } from '../observability/logger';
import {
  RecommendationContext,
  RecommendationResult,
  Recommendation,
  RecommendedProduct,
  RecommendationType,
} from './types';

const log = logger.child({ component: 'recommendation-engine' });

// ───── Complementary Product Rules ─────────────────────────

interface ComplementaryRule {
  trigger: string[];       // Keywords in cart product names
  recommend: RecommendedProduct[];
  reason: string;
}

const COMPLEMENTARY_RULES: ComplementaryRule[] = [
  {
    trigger: ['composite', 'resin'],
    recommend: [
      {
        productId: 'rec_bond_agent',
        name: 'Universal Bonding Agent',
        price: 1200,
        sellingPrice: 999,
        category: 'Restorative',
        inStock: true,
      },
      {
        productId: 'rec_curing_tips',
        name: 'Curing Light Tips (Pack of 5)',
        price: 650,
        sellingPrice: 549,
        category: 'Equipment',
        inStock: true,
      },
    ],
    reason: 'Essential companion for composite work',
  },
  {
    trigger: ['dental mirror', 'mirror'],
    recommend: [
      {
        productId: 'rec_sterilization',
        name: 'Sterilization Pouches (200 pcs)',
        price: 800,
        sellingPrice: 649,
        category: 'Infection Control',
        inStock: true,
      },
    ],
    reason: 'Recommended for instrument sterilization',
  },
  {
    trigger: ['impression', 'alginate'],
    recommend: [
      {
        productId: 'rec_tray',
        name: 'Impression Trays Set (6 pcs)',
        price: 1500,
        sellingPrice: 1199,
        category: 'Prosthodontics',
        inStock: true,
      },
      {
        productId: 'rec_adhesive',
        name: 'Tray Adhesive Spray',
        price: 450,
        sellingPrice: 389,
        category: 'Prosthodontics',
        inStock: true,
      },
    ],
    reason: 'Frequently bought with impression materials',
  },
  {
    trigger: ['scaler', 'scaling'],
    recommend: [
      {
        productId: 'rec_polishing',
        name: 'Prophy Polishing Paste',
        price: 350,
        sellingPrice: 299,
        category: 'Preventive',
        inStock: true,
      },
    ],
    reason: 'Complete your scaling & polishing setup',
  },
  {
    trigger: ['gloves', 'latex', 'nitrile'],
    recommend: [
      {
        productId: 'rec_mask',
        name: 'Surgical Face Masks (50 pcs)',
        price: 250,
        sellingPrice: 199,
        category: 'PPE',
        inStock: true,
      },
      {
        productId: 'rec_disinfectant',
        name: 'Surface Disinfectant Spray 500ml',
        price: 400,
        sellingPrice: 349,
        category: 'Infection Control',
        inStock: true,
      },
    ],
    reason: 'Complete your infection control supplies',
  },
  {
    trigger: ['endo', 'root canal', 'file'],
    recommend: [
      {
        productId: 'rec_irrigant',
        name: 'Sodium Hypochlorite Solution 500ml',
        price: 280,
        sellingPrice: 229,
        category: 'Endodontics',
        inStock: true,
      },
      {
        productId: 'rec_gutta',
        name: 'Gutta Percha Points (120 pcs)',
        price: 550,
        sellingPrice: 449,
        category: 'Endodontics',
        inStock: true,
      },
    ],
    reason: 'Essential for endodontic procedures',
  },
];

// ───── Upsell Rules ────────────────────────────────────────

interface UpsellRule {
  trigger: string[];
  recommend: RecommendedProduct;
  reason: string;
}

const UPSELL_RULES: UpsellRule[] = [
  {
    trigger: ['single', '1 pc', '1pc'],
    recommend: {
      productId: 'rec_bulk_pack',
      name: 'Value Pack (5 pcs) — Save 25%',
      price: 5000,
      sellingPrice: 3750,
      category: 'Bulk Packs',
      inStock: true,
    },
    reason: 'Save 25% with bulk pack',
  },
];

// ───── Trending Products ───────────────────────────────────

const TRENDING_PRODUCTS: RecommendedProduct[] = [
  {
    productId: 'rec_trend_1',
    name: 'LED Curing Light (Wireless)',
    price: 8500,
    sellingPrice: 6999,
    category: 'Equipment',
    inStock: true,
  },
  {
    productId: 'rec_trend_2',
    name: 'Dental Loupes 3.5x Magnification',
    price: 12000,
    sellingPrice: 9499,
    category: 'Equipment',
    inStock: true,
  },
  {
    productId: 'rec_trend_3',
    name: 'Tooth Whitening Kit Professional',
    price: 3500,
    sellingPrice: 2799,
    category: 'Cosmetic',
    inStock: true,
  },
];

// ───── Engine ──────────────────────────────────────────────

export class RecommendationEngine {
  /**
   * Generate recommendations based on context.
   */
  recommend(context: RecommendationContext, maxResults: number = 4): RecommendationResult {
    const recommendations: Recommendation[] = [];
    let strategy = 'none';

    // Strategy 1: Complementary products based on cart
    if (context.cartProductNames && context.cartProductNames.length > 0) {
      const complementary = this.findComplementary(context.cartProductNames, context.cartProductIds);
      recommendations.push(...complementary);
      if (complementary.length > 0) strategy = 'complementary';
    }

    // Strategy 2: Upsell from cart items
    if (context.cartProductNames && context.cartProductNames.length > 0) {
      const upsells = this.findUpsells(context.cartProductNames);
      recommendations.push(...upsells);
      if (upsells.length > 0 && strategy === 'none') strategy = 'upsell';
    }

    // Strategy 3: Query-based recommendations
    if (context.currentQuery) {
      const queryBased = this.findFromQuery(context.currentQuery, context.cartProductIds);
      recommendations.push(...queryBased);
      if (queryBased.length > 0 && strategy === 'none') strategy = 'query_match';
    }

    // Strategy 4: Fill remaining slots with trending
    if (recommendations.length < maxResults) {
      const remaining = maxResults - recommendations.length;
      const trending = this.getTrending(remaining, context.cartProductIds);
      recommendations.push(...trending);
      if (trending.length > 0 && strategy === 'none') strategy = 'trending';
    }

    // Deduplicate and limit
    const seen = new Set<string | number>();
    const unique = recommendations.filter((r) => {
      if (seen.has(r.product.productId)) return false;
      seen.add(r.product.productId);
      return true;
    });

    const final = unique.slice(0, maxResults);

    log.info({
      cartItems: context.cartProductNames?.length ?? 0,
      query: context.currentQuery,
      recommendationCount: final.length,
      strategy,
    }, 'Recommendations generated');

    return {
      recommendations: final,
      context: this.buildContextSummary(context),
      strategy,
    };
  }

  private findComplementary(
    cartNames: string[],
    cartProductIds?: (string | number)[],
  ): Recommendation[] {
    const results: Recommendation[] = [];
    const existingIds = new Set(cartProductIds?.map(String) ?? []);

    for (const rule of COMPLEMENTARY_RULES) {
      const matches = cartNames.some((name) =>
        rule.trigger.some((kw) => name.toLowerCase().includes(kw)),
      );

      if (matches) {
        for (const product of rule.recommend) {
          if (!existingIds.has(String(product.productId))) {
            results.push({
              type: 'complementary',
              reason: rule.reason,
              confidence: 0.85,
              product,
            });
          }
        }
      }
    }

    return results;
  }

  private findUpsells(cartNames: string[]): Recommendation[] {
    const results: Recommendation[] = [];

    for (const rule of UPSELL_RULES) {
      const matches = cartNames.some((name) =>
        rule.trigger.some((kw) => name.toLowerCase().includes(kw)),
      );

      if (matches) {
        results.push({
          type: 'upsell',
          reason: rule.reason,
          confidence: 0.7,
          product: rule.recommend,
        });
      }
    }

    return results;
  }

  private findFromQuery(
    query: string,
    cartProductIds?: (string | number)[],
  ): Recommendation[] {
    const results: Recommendation[] = [];
    const lowerQuery = query.toLowerCase();
    const existingIds = new Set(cartProductIds?.map(String) ?? []);

    for (const rule of COMPLEMENTARY_RULES) {
      if (rule.trigger.some((kw) => lowerQuery.includes(kw))) {
        for (const product of rule.recommend) {
          if (!existingIds.has(String(product.productId))) {
            results.push({
              type: 'cross_sell',
              reason: `Recommended based on your search`,
              confidence: 0.65,
              product,
            });
          }
        }
      }
    }

    return results;
  }

  private getTrending(
    count: number,
    excludeIds?: (string | number)[],
  ): Recommendation[] {
    const exclude = new Set(excludeIds?.map(String) ?? []);
    return TRENDING_PRODUCTS
      .filter((p) => !exclude.has(String(p.productId)))
      .slice(0, count)
      .map((product) => ({
        type: 'trending' as RecommendationType,
        reason: 'Trending product',
        confidence: 0.5,
        product,
      }));
  }

  private buildContextSummary(context: RecommendationContext): string {
    const parts: string[] = [];
    if (context.cartProductNames?.length) {
      parts.push(`cart: ${context.cartProductNames.join(', ')}`);
    }
    if (context.currentQuery) {
      parts.push(`query: "${context.currentQuery}"`);
    }
    if (context.customerSegment) {
      parts.push(`segment: ${context.customerSegment}`);
    }
    return parts.join(' | ') || 'general browsing';
  }
}

// ───── Singleton ───────────────────────────────────────────

let engine: RecommendationEngine | null = null;

export function initRecommendationEngine(): RecommendationEngine {
  engine = new RecommendationEngine();
  return engine;
}

export function getRecommendationEngine(): RecommendationEngine | null {
  return engine;
}
