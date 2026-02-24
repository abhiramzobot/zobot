/**
 * Coupon / Discount Engine — Type Definitions
 *
 * Supports percentage, fixed-amount, and free-shipping coupons
 * with eligibility rules (min order, category, customer segment, max uses).
 */

export type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping' | 'buy_x_get_y';

export interface CouponRule {
  code: string;                          // Unique coupon code (uppercase)
  type: CouponType;
  value: number;                         // Discount value (% for percentage, ₹ for fixed)
  maxDiscount?: number;                  // Cap for percentage discounts
  minOrderValue?: number;                // Minimum cart subtotal
  minItems?: number;                     // Minimum items in cart
  maxUses?: number;                      // Total uses allowed
  maxUsesPerCustomer?: number;           // Uses per customer
  validFrom?: number;                    // Unix timestamp
  validUntil?: number;                   // Unix timestamp
  applicableCategories?: string[];       // Restrict to categories (empty = all)
  applicableProductIds?: (string | number)[];  // Restrict to products
  excludedProductIds?: (string | number)[];    // Exclude products
  customerSegments?: string[];           // VIP, Regular, New, etc.
  description: string;                   // Human-readable description
  isActive: boolean;
  createdAt: number;
}

export interface AppliedCoupon {
  code: string;
  type: CouponType;
  discountAmount: number;                // Calculated discount in ₹
  description: string;
  appliedAt: number;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  message: string;
  discountAmount?: number;               // Estimated discount
  discountLabel?: string;                // e.g., "15% Off", "₹200 Off"
  rule?: CouponRule;
}

export interface CouponStore {
  getCoupon(code: string): CouponRule | null;
  getAllActive(): CouponRule[];
  saveCoupon(rule: CouponRule): void;
  incrementUsage(code: string, visitorId: string): void;
  getUsageCount(code: string): number;
  getCustomerUsageCount(code: string, visitorId: string): number;
}
