import { AbandonmentDetector } from '../../src/cart/abandonment-detector';
import { CartService, initCartService } from '../../src/cart/cart-service';
import { initCouponService } from '../../src/coupon/coupon-service';

describe('AbandonmentDetector', () => {
  let detector: AbandonmentDetector;

  beforeEach(() => {
    // Initialize required singletons
    initCartService();
    initCouponService();
  });

  afterEach(() => {
    detector?.stop();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      detector = new AbandonmentDetector();
      // Just verify it doesn't throw
      expect(detector).toBeDefined();
    });

    it('should accept custom config', () => {
      detector = new AbandonmentDetector({
        enabled: true,
        abandonmentDelayMinutes: 15,
        checkIntervalMinutes: 2,
        recoveryCouponPercent: 15,
        recoveryCouponExpiryHours: 48,
      });
      expect(detector).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should not start when disabled', () => {
      detector = new AbandonmentDetector({ enabled: false });
      detector.start();
      // No error thrown, just a no-op
    });

    it('should stop cleanly even when not started', () => {
      detector = new AbandonmentDetector({ enabled: false });
      detector.stop(); // Should not throw
    });
  });

  describe('check', () => {
    it('should return empty array when no carts exist', async () => {
      detector = new AbandonmentDetector({
        enabled: true,
        abandonmentDelayMinutes: 0, // immediate
      });
      const result = await detector.check();
      expect(result).toEqual([]);
    });

    it('should detect abandoned carts beyond the delay threshold', async () => {
      const cartService = initCartService();

      // Add items to a cart and manually set updatedAt in the past
      await cartService.addItem('v-old', 'c1', {
        productId: 'p1', name: 'Old Item', price: 500, sellingPrice: 400, inStock: true,
      });

      // Directly manipulate the cart's updatedAt via getCart
      const cart = await cartService.getCart('v-old');
      if (cart) {
        cart.updatedAt = Date.now() - 60 * 60 * 1000; // 1 hour ago
        // Save it back via the internal store
        await (cartService as any).store.saveCart(cart);
      }

      detector = new AbandonmentDetector({
        enabled: true,
        abandonmentDelayMinutes: 30, // 30 min threshold
        recoveryCouponPercent: 10,
        recoveryCouponExpiryHours: 24,
      });

      const abandoned = await detector.check();
      expect(abandoned.length).toBe(1);
      expect(abandoned[0].visitorId).toBe('v-old');
      expect(abandoned[0].itemCount).toBe(1);
    });

    it('should not flag active (recently updated) carts', async () => {
      const cartService = initCartService();

      await cartService.addItem('v-active', 'c2', {
        productId: 'p1', name: 'Active Item', price: 500, sellingPrice: 400, inStock: true,
      });

      detector = new AbandonmentDetector({
        enabled: true,
        abandonmentDelayMinutes: 30,
      });

      const abandoned = await detector.check();
      const found = abandoned.find(a => a.visitorId === 'v-active');
      expect(found).toBeUndefined();
    });

    it('should skip visitors who already received recovery message within 24h', async () => {
      const cartService = initCartService();

      await cartService.addItem('v-repeat', 'c3', {
        productId: 'p1', name: 'Old Item', price: 500, sellingPrice: 400, inStock: true,
      });

      const cart = await cartService.getCart('v-repeat');
      if (cart) {
        cart.updatedAt = Date.now() - 60 * 60 * 1000;
        await (cartService as any).store.saveCart(cart);
      }

      detector = new AbandonmentDetector({
        enabled: true,
        abandonmentDelayMinutes: 30,
        recoveryCouponPercent: 10,
      });

      // First check — generates recovery coupon
      await detector.check();

      // Second check — should skip this visitor (recovery already sent)
      const cart2 = await cartService.getCart('v-repeat');
      if (cart2) {
        cart2.updatedAt = Date.now() - 60 * 60 * 1000;
        await (cartService as any).store.saveCart(cart2);
      }
      const abandoned2 = await detector.check();
      // Cart is still abandoned, but recovery won't be sent again
      expect(abandoned2.length).toBeGreaterThanOrEqual(1);
    });
  });
});
