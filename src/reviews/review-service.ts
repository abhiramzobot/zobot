/**
 * Product Review Service (Enhancement v5 — C1)
 *
 * Manages product reviews: submit, query, calculate averages.
 * In-memory store with Redis-ready interface.
 */

import { v4 as uuid } from 'uuid';
import { ProductReview, ReviewSummary, ReviewStore } from './types';
import { logger } from '../observability/logger';

const log = logger.child({ component: 'review-service' });

// ───── In-Memory Review Store ──────────────────────────────

class InMemoryReviewStore implements ReviewStore {
  private reviews: ProductReview[] = [];

  async saveReview(review: ProductReview): Promise<void> {
    this.reviews.push(review);
  }

  async getByProduct(productId: string | number): Promise<ProductReview[]> {
    return this.reviews.filter(
      (r) => String(r.productId) === String(productId) && r.status === 'approved',
    );
  }

  async getByVisitor(visitorId: string): Promise<ProductReview[]> {
    return this.reviews.filter((r) => r.visitorId === visitorId);
  }

  async getByOrder(orderId: string): Promise<ProductReview[]> {
    return this.reviews.filter((r) => r.orderId === orderId);
  }

  async getReviewSummary(productId: string | number): Promise<ReviewSummary> {
    const reviews = await this.getByProduct(productId);
    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    let totalRating = 0;
    for (const r of reviews) {
      totalRating += r.rating;
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    }

    return {
      productId,
      productName: reviews[0]?.productName || 'Unknown',
      averageRating: reviews.length > 0 ? Math.round((totalRating / reviews.length) * 10) / 10 : 0,
      totalReviews: reviews.length,
      ratingDistribution: distribution,
    };
  }
}

// ───── Review Service ──────────────────────────────────────

export class ReviewService {
  private store: ReviewStore;

  constructor(store?: ReviewStore) {
    this.store = store || new InMemoryReviewStore();
  }

  /** Submit a product review */
  async submitReview(params: {
    productId: string | number;
    productName: string;
    orderId?: string;
    visitorId: string;
    rating: number;
    reviewText: string;
    pros?: string[];
    cons?: string[];
  }): Promise<ProductReview> {
    // Validate rating
    const rating = Math.max(1, Math.min(5, Math.round(params.rating)));

    const review: ProductReview = {
      reviewId: `rev_${uuid().substring(0, 8)}`,
      productId: params.productId,
      productName: params.productName,
      orderId: params.orderId,
      visitorId: params.visitorId,
      rating,
      reviewText: params.reviewText.substring(0, 1000), // Limit length
      pros: params.pros,
      cons: params.cons,
      verified: !!params.orderId, // Verified if orderId is provided
      status: 'approved', // Auto-approve for demo; in production: 'pending'
      createdAt: Date.now(),
    };

    await this.store.saveReview(review);

    log.info({
      reviewId: review.reviewId,
      productId: review.productId,
      rating: review.rating,
      verified: review.verified,
    }, 'Product review submitted');

    return review;
  }

  /** Get reviews for a product */
  async getProductReviews(productId: string | number): Promise<ProductReview[]> {
    return this.store.getByProduct(productId);
  }

  /** Get review summary (average rating, distribution) */
  async getProductSummary(productId: string | number): Promise<ReviewSummary> {
    return this.store.getReviewSummary(productId);
  }

  /** Get reviews by a visitor */
  async getVisitorReviews(visitorId: string): Promise<ProductReview[]> {
    return this.store.getByVisitor(visitorId);
  }

  /** Check if visitor has already reviewed a product */
  async hasReviewed(visitorId: string, productId: string | number): Promise<boolean> {
    const reviews = await this.store.getByVisitor(visitorId);
    return reviews.some((r) => String(r.productId) === String(productId));
  }
}

// ───── Singleton ───────────────────────────────────────────

let reviewService: ReviewService | null = null;

export function initReviewService(store?: ReviewStore): ReviewService {
  reviewService = new ReviewService(store);
  return reviewService;
}

export function getReviewService(): ReviewService | null {
  return reviewService;
}
