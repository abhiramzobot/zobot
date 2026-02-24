/**
 * Product Review Types (Enhancement v5 — C1)
 */

export interface ProductReview {
  reviewId: string;
  productId: string | number;
  productName: string;
  orderId?: string;
  visitorId: string;
  rating: number;            // 1-5 stars
  reviewText: string;
  pros?: string[];
  cons?: string[];
  verified: boolean;         // Verified purchase
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface ReviewSummary {
  productId: string | number;
  productName: string;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>; // { 5: 12, 4: 8, 3: 3, 2: 1, 1: 0 }
}

export interface ReviewStore {
  saveReview(review: ProductReview): Promise<void>;
  getByProduct(productId: string | number): Promise<ProductReview[]>;
  getByVisitor(visitorId: string): Promise<ProductReview[]>;
  getByOrder(orderId: string): Promise<ProductReview[]>;
  getReviewSummary(productId: string | number): Promise<ReviewSummary>;
}
