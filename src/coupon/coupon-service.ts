/**
 * Coupon / Discount Service
 *
 * Validates, applies, and generates coupon codes.
 * Supports in-memory store with pre-seeded demo coupons.
 */

import { logger } from '../observability/logger';
import {
  CouponRule,
  CouponType,
  CouponValidationResult,
  AppliedCoupon,
  CouponStore,
} from './types';

const log = logger.child({ module: 'coupon-service' });

// ───── In-Memory Coupon Store ──────────────────────────────

class InMemoryCouponStore implements CouponStore {
  private coupons = new Map<string, CouponRule>();
  private usageCounts = new Map<string, number>();
  private customerUsage = new Map<string, number>(); // "{code}:{visitorId}" => count

  getCoupon(code: string): CouponRule | null {
    return this.coupons.get(code.toUpperCase()) || null;
  }

  getAllActive(): CouponRule[] {
    const now = Date.now();
    return Array.from(this.coupons.values()).filter(c =>
      c.isActive &&
      (!c.validFrom || c.validFrom <= now) &&
      (!c.validUntil || c.validUntil >= now),
    );
  }

  saveCoupon(rule: CouponRule): void {
    this.coupons.set(rule.code.toUpperCase(), rule);
  }

  incrementUsage(code: string, visitorId: string): void {
    const key = code.toUpperCase();
    this.usageCounts.set(key, (this.usageCounts.get(key) || 0) + 1);
    const custKey = `${key}:${visitorId}`;
    this.customerUsage.set(custKey, (this.customerUsage.get(custKey) || 0) + 1);
  }

  getUsageCount(code: string): number {
    return this.usageCounts.get(code.toUpperCase()) || 0;
  }

  getCustomerUsageCount(code: string, visitorId: string): number {
    return this.customerUsage.get(`${code.toUpperCase()}:${visitorId}`) || 0;
  }
}

// ───── Coupon Service ──────────────────────────────────────

export class CouponService {
  private store: CouponStore;

  constructor(store?: CouponStore) {
    this.store = store || new InMemoryCouponStore();
    this.seedDemoCoupons();
  }

  /**
   * Validate a coupon code against cart contents.
   */
  validate(
    code: string,
    cartSubtotal: number,
    cartItemCount: number,
    visitorId: string,
    productIds?: (string | number)[],
    customerSegment?: string,
  ): CouponValidationResult {
    const normalizedCode = code.toUpperCase().trim();
    const rule = this.store.getCoupon(normalizedCode);

    if (!rule) {
      return { valid: false, code: normalizedCode, message: `Coupon code "${normalizedCode}" is not valid.` };
    }

    if (!rule.isActive) {
      return { valid: false, code: normalizedCode, message: 'This coupon is no longer active.' };
    }

    const now = Date.now();
    if (rule.validFrom && rule.validFrom > now) {
      return { valid: false, code: normalizedCode, message: 'This coupon is not yet active.' };
    }
    if (rule.validUntil && rule.validUntil < now) {
      return { valid: false, code: normalizedCode, message: 'This coupon has expired.' };
    }

    if (rule.maxUses && this.store.getUsageCount(normalizedCode) >= rule.maxUses) {
      return { valid: false, code: normalizedCode, message: 'This coupon has reached its maximum usage limit.' };
    }

    if (rule.maxUsesPerCustomer) {
      const custUsage = this.store.getCustomerUsageCount(normalizedCode, visitorId);
      if (custUsage >= rule.maxUsesPerCustomer) {
        return { valid: false, code: normalizedCode, message: 'You have already used this coupon.' };
      }
    }

    if (rule.minOrderValue && cartSubtotal < rule.minOrderValue) {
      return {
        valid: false,
        code: normalizedCode,
        message: `Minimum order value of ₹${rule.minOrderValue} required. Your cart total is ₹${cartSubtotal.toFixed(2)}.`,
      };
    }

    if (rule.minItems && cartItemCount < rule.minItems) {
      return {
        valid: false,
        code: normalizedCode,
        message: `Minimum ${rule.minItems} items required in cart.`,
      };
    }

    if (rule.customerSegments && rule.customerSegments.length > 0 && customerSegment) {
      if (!rule.customerSegments.includes(customerSegment)) {
        return { valid: false, code: normalizedCode, message: 'This coupon is not available for your account.' };
      }
    }

    // Calculate discount
    const discountAmount = this.calculateDiscount(rule, cartSubtotal);
    const discountLabel = this.getDiscountLabel(rule);

    return {
      valid: true,
      code: normalizedCode,
      message: `Coupon "${normalizedCode}" applied! You save ₹${discountAmount.toFixed(2)}.`,
      discountAmount,
      discountLabel,
      rule,
    };
  }

  /**
   * Apply a validated coupon — records usage.
   */
  apply(code: string, visitorId: string, cartSubtotal: number): AppliedCoupon | null {
    const result = this.validate(code, cartSubtotal, 1, visitorId);
    if (!result.valid || !result.rule) return null;

    this.store.incrementUsage(code.toUpperCase(), visitorId);

    return {
      code: result.code,
      type: result.rule.type,
      discountAmount: result.discountAmount || 0,
      description: result.rule.description,
      appliedAt: Date.now(),
    };
  }

  /**
   * Generate a unique coupon code for retention/recovery.
   */
  generateRetentionCoupon(
    visitorId: string,
    discountPercent: number = 10,
    expiryHours: number = 24,
  ): CouponRule {
    const code = `SAVE${discountPercent}_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const rule: CouponRule = {
      code,
      type: 'percentage',
      value: discountPercent,
      maxDiscount: 500,
      maxUses: 1,
      maxUsesPerCustomer: 1,
      validUntil: Date.now() + expiryHours * 3600000,
      description: `${discountPercent}% off — special offer just for you!`,
      isActive: true,
      createdAt: Date.now(),
    };
    this.store.saveCoupon(rule);
    log.info({ code, visitorId, discountPercent, expiryHours }, 'Retention coupon generated');
    return rule;
  }

  /**
   * Get all currently active coupons (for display).
   */
  getActiveCoupons(): CouponRule[] {
    return this.store.getAllActive();
  }

  // ───── Private Helpers ─────────────────────────────────

  private calculateDiscount(rule: CouponRule, subtotal: number): number {
    switch (rule.type) {
      case 'percentage': {
        const disc = subtotal * (rule.value / 100);
        return rule.maxDiscount ? Math.min(disc, rule.maxDiscount) : disc;
      }
      case 'fixed_amount':
        return Math.min(rule.value, subtotal);
      case 'free_shipping':
        return 0; // Handled separately
      default:
        return 0;
    }
  }

  private getDiscountLabel(rule: CouponRule): string {
    switch (rule.type) {
      case 'percentage':
        return rule.maxDiscount
          ? `${rule.value}% Off (up to ₹${rule.maxDiscount})`
          : `${rule.value}% Off`;
      case 'fixed_amount':
        return `₹${rule.value} Off`;
      case 'free_shipping':
        return 'Free Shipping';
      default:
        return 'Discount';
    }
  }

  /**
   * Seed demo coupons for development/testing.
   */
  private seedDemoCoupons(): void {
    const demoCoupons: CouponRule[] = [
      {
        code: 'DENTAL15',
        type: 'percentage',
        value: 15,
        maxDiscount: 500,
        minOrderValue: 999,
        description: '15% off on orders above ₹999 (max ₹500 off)',
        isActive: true,
        createdAt: Date.now(),
      },
      {
        code: 'WELCOME200',
        type: 'fixed_amount',
        value: 200,
        minOrderValue: 500,
        maxUsesPerCustomer: 1,
        customerSegments: ['new'],
        description: '₹200 off on your first order above ₹500',
        isActive: true,
        createdAt: Date.now(),
      },
      {
        code: 'FREESHIP',
        type: 'free_shipping',
        value: 0,
        minOrderValue: 299,
        description: 'Free shipping on orders above ₹299',
        isActive: true,
        createdAt: Date.now(),
      },
      {
        code: 'BULK20',
        type: 'percentage',
        value: 20,
        maxDiscount: 2000,
        minOrderValue: 5000,
        minItems: 5,
        description: '20% off on bulk orders (5+ items, min ₹5000)',
        isActive: true,
        createdAt: Date.now(),
      },
      {
        code: 'VIP25',
        type: 'percentage',
        value: 25,
        maxDiscount: 1000,
        customerSegments: ['vip'],
        description: 'VIP exclusive: 25% off (max ₹1000 off)',
        isActive: true,
        createdAt: Date.now(),
      },
    ];

    demoCoupons.forEach(c => this.store.saveCoupon(c));
    log.info({ count: demoCoupons.length }, 'Demo coupons seeded');
  }
}

// ───── Singleton ───────────────────────────────────────────

let couponService: CouponService | null = null;

export function initCouponService(store?: CouponStore): CouponService {
  couponService = new CouponService(store);
  return couponService;
}

export function getCouponService(): CouponService | null {
  return couponService;
}
