import { ReviewService } from '../../src/reviews/review-service';

describe('ReviewService', () => {
  let service: ReviewService;

  beforeEach(() => {
    service = new ReviewService();
  });

  describe('submitReview', () => {
    it('should create a review with valid data', async () => {
      const review = await service.submitReview({
        productId: 'prod-123',
        productName: 'Dental Composite Kit',
        visitorId: 'visitor-1',
        rating: 4,
        reviewText: 'Great product, fast delivery!',
      });

      expect(review.reviewId).toMatch(/^rev_/);
      expect(review.productId).toBe('prod-123');
      expect(review.rating).toBe(4);
      expect(review.verified).toBe(false); // No orderId
      expect(review.status).toBe('approved');
    });

    it('should mark review as verified when orderId provided', async () => {
      const review = await service.submitReview({
        productId: 'prod-123',
        productName: 'Dental Composite Kit',
        orderId: 'ORD-001',
        visitorId: 'visitor-1',
        rating: 5,
        reviewText: 'Excellent!',
      });

      expect(review.verified).toBe(true);
    });

    it('should clamp rating to 1-5 range', async () => {
      const low = await service.submitReview({
        productId: 'p1', productName: 'P1', visitorId: 'v1',
        rating: -2, reviewText: 'Bad',
      });
      expect(low.rating).toBe(1);

      const high = await service.submitReview({
        productId: 'p2', productName: 'P2', visitorId: 'v2',
        rating: 10, reviewText: 'Over the top',
      });
      expect(high.rating).toBe(5);
    });

    it('should truncate review text to 1000 chars', async () => {
      const longText = 'A'.repeat(2000);
      const review = await service.submitReview({
        productId: 'p1', productName: 'P1', visitorId: 'v1',
        rating: 3, reviewText: longText,
      });
      expect(review.reviewText.length).toBe(1000);
    });

    it('should accept pros and cons', async () => {
      const review = await service.submitReview({
        productId: 'p1', productName: 'P1', visitorId: 'v1',
        rating: 4, reviewText: 'Good',
        pros: ['Fast delivery', 'Good quality'],
        cons: ['Expensive'],
      });
      expect(review.pros).toEqual(['Fast delivery', 'Good quality']);
      expect(review.cons).toEqual(['Expensive']);
    });
  });

  describe('getProductReviews', () => {
    it('should return approved reviews for a product', async () => {
      await service.submitReview({
        productId: 'prod-A', productName: 'Product A', visitorId: 'v1',
        rating: 5, reviewText: 'Excellent',
      });
      await service.submitReview({
        productId: 'prod-A', productName: 'Product A', visitorId: 'v2',
        rating: 3, reviewText: 'OK',
      });
      await service.submitReview({
        productId: 'prod-B', productName: 'Product B', visitorId: 'v3',
        rating: 4, reviewText: 'Nice',
      });

      const reviews = await service.getProductReviews('prod-A');
      expect(reviews.length).toBe(2);
      expect(reviews.every(r => String(r.productId) === 'prod-A')).toBe(true);
    });

    it('should return empty array for unreviewed product', async () => {
      const reviews = await service.getProductReviews('nonexistent');
      expect(reviews).toEqual([]);
    });
  });

  describe('getProductSummary', () => {
    it('should calculate average rating and distribution', async () => {
      await service.submitReview({ productId: 'p1', productName: 'P1', visitorId: 'v1', rating: 5, reviewText: 'A' });
      await service.submitReview({ productId: 'p1', productName: 'P1', visitorId: 'v2', rating: 3, reviewText: 'B' });
      await service.submitReview({ productId: 'p1', productName: 'P1', visitorId: 'v3', rating: 4, reviewText: 'C' });

      const summary = await service.getProductSummary('p1');
      expect(summary.totalReviews).toBe(3);
      expect(summary.averageRating).toBe(4); // (5+3+4)/3 = 4.0
      expect(summary.ratingDistribution[5]).toBe(1);
      expect(summary.ratingDistribution[4]).toBe(1);
      expect(summary.ratingDistribution[3]).toBe(1);
    });

    it('should return zero average for unreviewed product', async () => {
      const summary = await service.getProductSummary('empty');
      expect(summary.averageRating).toBe(0);
      expect(summary.totalReviews).toBe(0);
    });
  });

  describe('getVisitorReviews', () => {
    it('should return all reviews by a visitor', async () => {
      await service.submitReview({ productId: 'p1', productName: 'P1', visitorId: 'v1', rating: 5, reviewText: 'A' });
      await service.submitReview({ productId: 'p2', productName: 'P2', visitorId: 'v1', rating: 4, reviewText: 'B' });
      await service.submitReview({ productId: 'p3', productName: 'P3', visitorId: 'v2', rating: 3, reviewText: 'C' });

      const reviews = await service.getVisitorReviews('v1');
      expect(reviews.length).toBe(2);
    });
  });

  describe('hasReviewed', () => {
    it('should return true if visitor reviewed the product', async () => {
      await service.submitReview({ productId: 'p1', productName: 'P1', visitorId: 'v1', rating: 4, reviewText: 'X' });
      expect(await service.hasReviewed('v1', 'p1')).toBe(true);
    });

    it('should return false if visitor has not reviewed', async () => {
      expect(await service.hasReviewed('v1', 'nonexistent')).toBe(false);
    });
  });
});
