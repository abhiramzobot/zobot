import { CouponService } from '../../src/coupon/coupon-service';

describe('CouponService', () => {
  let service: CouponService;

  beforeEach(() => {
    service = new CouponService();
  });

  describe('validate', () => {
    it('should validate a percentage coupon successfully', () => {
      const result = service.validate('DENTAL15', 1500, 2, 'visitor-1');
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBeDefined();
      expect(result.discountAmount!).toBeCloseTo(225); // 15% of 1500
      expect(result.discountLabel).toContain('15%');
    });

    it('should cap discount at maxDiscount', () => {
      const result = service.validate('DENTAL15', 10000, 2, 'visitor-1');
      expect(result.valid).toBe(true);
      expect(result.discountAmount!).toBe(500); // maxDiscount = 500
    });

    it('should validate a fixed_amount coupon', () => {
      const result = service.validate('WELCOME200', 1000, 2, 'visitor-1', undefined, 'new');
      expect(result.valid).toBe(true);
      expect(result.discountAmount!).toBe(200);
    });

    it('should reject invalid coupon code', () => {
      const result = service.validate('INVALIDCODE', 1000, 1, 'visitor-1');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('not valid');
    });

    it('should reject coupon when cart subtotal below minOrderValue', () => {
      const result = service.validate('DENTAL15', 500, 1, 'visitor-1');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Minimum order value');
    });

    it('should reject coupon when cart has insufficient items', () => {
      const result = service.validate('BULK20', 6000, 3, 'visitor-1');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Minimum 5 items');
    });

    it('should reject coupon for wrong customer segment', () => {
      const result = service.validate('VIP25', 2000, 2, 'visitor-1', undefined, 'regular');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('not available');
    });

    it('should validate free shipping coupon', () => {
      const result = service.validate('FREESHIP', 500, 1, 'visitor-1');
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(0); // free shipping = 0 discount on subtotal
    });

    it('should be case-insensitive for coupon codes', () => {
      const result = service.validate('dental15', 1500, 2, 'visitor-1');
      expect(result.valid).toBe(true);
    });

    it('should enforce maxUsesPerCustomer', () => {
      // First usage
      service.apply('WELCOME200', 'visitor-1', 1000);
      // Second attempt by same visitor
      const result = service.validate('WELCOME200', 1000, 1, 'visitor-1', undefined, 'new');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('already used');
    });
  });

  describe('apply', () => {
    it('should record usage and return applied coupon', () => {
      const applied = service.apply('DENTAL15', 'visitor-1', 1500);
      expect(applied).not.toBeNull();
      expect(applied!.code).toBe('DENTAL15');
      expect(applied!.type).toBe('percentage');
      expect(applied!.discountAmount).toBeCloseTo(225);
    });

    it('should return null for invalid coupon', () => {
      const applied = service.apply('FAKE', 'visitor-1', 1000);
      expect(applied).toBeNull();
    });
  });

  describe('generateRetentionCoupon', () => {
    it('should create a unique coupon code', () => {
      const coupon = service.generateRetentionCoupon('visitor-1', 10, 24);
      expect(coupon.code).toMatch(/^SAVE10_/);
      expect(coupon.type).toBe('percentage');
      expect(coupon.value).toBe(10);
      expect(coupon.maxUses).toBe(1);
      expect(coupon.maxDiscount).toBe(500);
      expect(coupon.isActive).toBe(true);
    });

    it('should generate a valid coupon that can be applied', () => {
      const coupon = service.generateRetentionCoupon('visitor-1', 15, 48);
      const result = service.validate(coupon.code, 2000, 1, 'visitor-1');
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBeGreaterThan(0);
    });

    it('should generate different codes each time', () => {
      const c1 = service.generateRetentionCoupon('v1', 10);
      const c2 = service.generateRetentionCoupon('v2', 10);
      expect(c1.code).not.toBe(c2.code);
    });
  });

  describe('getActiveCoupons', () => {
    it('should return all active demo coupons', () => {
      const active = service.getActiveCoupons();
      expect(active.length).toBe(5);
      const codes = active.map(c => c.code);
      expect(codes).toContain('DENTAL15');
      expect(codes).toContain('WELCOME200');
      expect(codes).toContain('FREESHIP');
      expect(codes).toContain('BULK20');
      expect(codes).toContain('VIP25');
    });
  });
});
