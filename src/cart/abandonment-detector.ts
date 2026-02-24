/**
 * Cart Abandonment Detector (Enhancement v5 — A2)
 *
 * Monitors cart age and triggers proactive re-engagement
 * with personalized coupons via the outbound engine.
 */

import { getCartService } from './cart-service';
import { getCouponService } from '../coupon/coupon-service';
import { logger } from '../observability/logger';

const log = logger.child({ component: 'abandonment-detector' });

export interface AbandonmentConfig {
  enabled: boolean;
  /** Minutes of inactivity before a cart is considered abandoned */
  abandonmentDelayMinutes: number;
  /** How often to check for abandoned carts (minutes) */
  checkIntervalMinutes: number;
  /** Discount percent for recovery coupon */
  recoveryCouponPercent: number;
  /** Recovery coupon expiry (hours) */
  recoveryCouponExpiryHours: number;
}

const DEFAULT_CONFIG: AbandonmentConfig = {
  enabled: false,
  abandonmentDelayMinutes: 30,
  checkIntervalMinutes: 5,
  recoveryCouponPercent: 10,
  recoveryCouponExpiryHours: 24,
};

export interface AbandonedCartInfo {
  visitorId: string;
  cartId: string;
  itemCount: number;
  subtotal: number;
  lastUpdatedAt: number;
  minutesSinceUpdate: number;
}

/** Tracks which visitors have already been sent recovery messages */
const recoveryAttempts = new Map<string, number>(); // visitorId → timestamp

export class AbandonmentDetector {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private config: AbandonmentConfig;

  constructor(config?: Partial<AbandonmentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start the background polling loop */
  start(): void {
    if (!this.config.enabled) {
      log.info('Cart abandonment detector disabled');
      return;
    }

    if (this.intervalHandle) {
      log.warn('Abandonment detector already running');
      return;
    }

    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
    this.intervalHandle = setInterval(() => this.check(), intervalMs);
    log.info({
      delayMinutes: this.config.abandonmentDelayMinutes,
      intervalMinutes: this.config.checkIntervalMinutes,
    }, 'Cart abandonment detector started');
  }

  /** Stop the background polling loop */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('Cart abandonment detector stopped');
    }
  }

  /** Main check: find abandoned carts and generate recovery coupons */
  async check(): Promise<AbandonedCartInfo[]> {
    const cartService = getCartService();
    if (!cartService) return [];

    const thresholdMs = this.config.abandonmentDelayMinutes * 60 * 1000;
    const abandonedCarts = await this.getAbandonedCarts(thresholdMs);

    if (abandonedCarts.length === 0) return [];

    log.info({ count: abandonedCarts.length }, 'Abandoned carts detected');

    const couponService = getCouponService();

    for (const abandoned of abandonedCarts) {
      // Skip if we already sent a recovery message recently (within 24h)
      const lastAttempt = recoveryAttempts.get(abandoned.visitorId);
      if (lastAttempt && Date.now() - lastAttempt < 24 * 3600 * 1000) {
        continue;
      }

      // Generate a personalized recovery coupon
      if (couponService) {
        const coupon = couponService.generateRetentionCoupon(
          abandoned.visitorId,
          this.config.recoveryCouponPercent,
          this.config.recoveryCouponExpiryHours,
        );

        log.info({
          visitorId: abandoned.visitorId,
          couponCode: coupon.code,
          subtotal: abandoned.subtotal,
          itemCount: abandoned.itemCount,
        }, 'Recovery coupon generated for abandoned cart');
      }

      recoveryAttempts.set(abandoned.visitorId, Date.now());
    }

    return abandonedCarts;
  }

  /** Find carts that have been idle longer than the threshold */
  private async getAbandonedCarts(thresholdMs: number): Promise<AbandonedCartInfo[]> {
    const cartService = getCartService();
    if (!cartService) return [];

    // Access the internal store to scan all carts
    // In production this would query Redis with SCAN
    const allCarts = await (cartService as any).store?.getAllCarts?.() ?? [];
    const now = Date.now();
    const abandoned: AbandonedCartInfo[] = [];

    for (const cart of allCarts) {
      if (!cart.items || cart.items.length === 0) continue;

      const elapsed = now - cart.updatedAt;
      if (elapsed >= thresholdMs) {
        const subtotal = cart.items.reduce(
          (sum: number, item: any) => sum + item.sellingPrice * item.quantity,
          0,
        );

        abandoned.push({
          visitorId: cart.visitorId,
          cartId: cart.cartId,
          itemCount: cart.items.length,
          subtotal,
          lastUpdatedAt: cart.updatedAt,
          minutesSinceUpdate: Math.round(elapsed / 60000),
        });
      }
    }

    return abandoned;
  }
}

// ───── Singleton ───────────────────────────────────────────

let detector: AbandonmentDetector | null = null;

export function initAbandonmentDetector(config?: Partial<AbandonmentConfig>): AbandonmentDetector {
  detector = new AbandonmentDetector(config);
  return detector;
}

export function getAbandonmentDetector(): AbandonmentDetector | null {
  return detector;
}
