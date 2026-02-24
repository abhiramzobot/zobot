import { env } from '../config/env';
import { logger } from '../observability/logger';

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory sliding-window rate limiter.
 * In production with multiple instances, replace with Redis-backed GCRA or sliding window.
 */
export class RateLimiter {
  private buckets: Map<string, RateBucket> = new Map();
  private readonly windowMs: number;

  constructor(
    private readonly maxRequests: number = env.security.rateLimitPerVisitor,
    windowSeconds: number = env.security.rateLimitWindowSeconds,
  ) {
    this.windowMs = windowSeconds * 1000;
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > this.maxRequests) {
      const retryAfterMs = bucket.resetAt - now;
      logger.warn({ key, count: bucket.count, limit: this.maxRequests }, 'Rate limit exceeded');
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    return {
      allowed: true,
      remaining: this.maxRequests - bucket.count,
      retryAfterMs: 0,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}

/** Per-visitor rate limiter */
export const visitorRateLimiter = new RateLimiter(
  env.security.rateLimitPerVisitor,
  env.security.rateLimitWindowSeconds,
);

/** Per-tenant rate limiter */
export const tenantRateLimiter = new RateLimiter(
  env.security.rateLimitPerTenant,
  env.security.rateLimitWindowSeconds,
);
