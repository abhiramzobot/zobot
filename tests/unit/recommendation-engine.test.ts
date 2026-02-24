import { RecommendationEngine } from '../../src/recommendations/recommendation-engine';
import { RecommendationContext } from '../../src/recommendations/types';

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  describe('complementary strategy', () => {
    it('should recommend bonding agent for composite products', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Dental Composite Kit'],
        cartProductIds: ['prod-1'],
      };
      const result = engine.recommend(ctx);
      expect(result.recommendations.length).toBeGreaterThan(0);
      const names = result.recommendations.map(r => r.product.name);
      expect(names).toContain('Universal Bonding Agent');
    });

    it('should recommend sterilization for dental mirror', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Dental Mirror Set'],
        cartProductIds: ['prod-2'],
      };
      const result = engine.recommend(ctx);
      const names = result.recommendations.map(r => r.product.name);
      expect(names).toContain('Sterilization Pouches (200 pcs)');
    });

    it('should not recommend products already in cart', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Composite Resin'],
        cartProductIds: ['rec_bond_agent'],
      };
      const result = engine.recommend(ctx);
      const ids = result.recommendations.map(r => r.product.productId);
      expect(ids).not.toContain('rec_bond_agent');
    });

    it('should recommend impression trays for alginate', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Alginate Impression Material'],
      };
      const result = engine.recommend(ctx);
      const names = result.recommendations.map(r => r.product.name);
      expect(names).toContain('Impression Trays Set (6 pcs)');
    });
  });

  describe('upsell strategy', () => {
    it('should suggest bulk pack for single items', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Single Use Syringe 1pc'],
      };
      const result = engine.recommend(ctx);
      const names = result.recommendations.map(r => r.product.name);
      expect(names.some(n => n.includes('Value Pack'))).toBe(true);
    });
  });

  describe('query-based strategy', () => {
    it('should recommend based on search query', () => {
      const ctx: RecommendationContext = {
        currentQuery: 'endo files for root canal',
      };
      const result = engine.recommend(ctx);
      expect(result.recommendations.length).toBeGreaterThan(0);
      const names = result.recommendations.map(r => r.product.name);
      expect(names.some(n => n.includes('Sodium Hypochlorite') || n.includes('Gutta Percha'))).toBe(true);
    });

    it('should return cross_sell type for query-based results', () => {
      const ctx: RecommendationContext = {
        currentQuery: 'scaling instruments',
      };
      const result = engine.recommend(ctx);
      const queryCrossSell = result.recommendations.filter(r => r.type === 'cross_sell');
      expect(queryCrossSell.length).toBeGreaterThan(0);
    });
  });

  describe('trending fallback', () => {
    it('should fill with trending when no other matches', () => {
      const ctx: RecommendationContext = {};
      const result = engine.recommend(ctx, 3);
      expect(result.recommendations.length).toBe(3);
      expect(result.strategy).toBe('trending');
      const types = result.recommendations.map(r => r.type);
      expect(types.every(t => t === 'trending')).toBe(true);
    });
  });

  describe('deduplication and limits', () => {
    it('should not return duplicate product IDs', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Composite Resin', 'Dental Composite'],
        currentQuery: 'composite bonding',
      };
      const result = engine.recommend(ctx, 10);
      const ids = result.recommendations.map(r => r.product.productId);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should respect maxResults limit', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Composite', 'Mirror', 'Gloves', 'Endo Files'],
        currentQuery: 'dental supplies',
      };
      const result = engine.recommend(ctx, 2);
      expect(result.recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('context summary', () => {
    it('should include cart and query in context', () => {
      const ctx: RecommendationContext = {
        cartProductNames: ['Composite'],
        currentQuery: 'bonding',
        customerSegment: 'vip',
      };
      const result = engine.recommend(ctx);
      expect(result.context).toContain('cart: Composite');
      expect(result.context).toContain('query: "bonding"');
      expect(result.context).toContain('segment: vip');
    });

    it('should return "general browsing" for empty context', () => {
      const result = engine.recommend({});
      expect(result.context).toBe('general browsing');
    });
  });
});
