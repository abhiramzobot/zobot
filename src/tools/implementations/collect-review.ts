/**
 * Collect Product Review Tool (Enhancement v5 — C1)
 *
 * Collects star rating + text review for products in-chat.
 * Triggered after delivery confirmation or when customer offers feedback.
 */

import { ToolDefinition, ToolHandler } from '../types';
import { getReviewService } from '../../reviews/review-service';
import { logger } from '../../observability/logger';

const handler: ToolHandler = async (args, ctx) => {
  const log = logger.child({ tool: 'collect_product_review', conversationId: ctx.conversationId });

  const reviewService = getReviewService();
  if (!reviewService) {
    return { success: false, error: 'Review service is not available.' };
  }

  const productId = args.product_id ? String(args.product_id).trim() : '';
  const productName = args.product_name ? String(args.product_name).trim() : '';
  const rating = args.rating ? Number(args.rating) : 0;
  const reviewText = args.review_text ? String(args.review_text).trim() : '';
  const orderId = args.order_id ? String(args.order_id).trim() : undefined;

  // If no rating provided, prompt for it
  if (!rating || rating < 1 || rating > 5) {
    return {
      success: true,
      data: {
        collectingReview: true,
        needsRating: true,
        productId,
        productName,
        message: productName
          ? `How would you rate "${productName}"? Please provide a rating from 1 to 5 stars.`
          : 'Which product would you like to review? Please provide the product name and your rating (1-5 stars).',
      },
    };
  }

  if (!productName && !productId) {
    return { success: false, error: 'Please specify which product you want to review.' };
  }

  // Check if already reviewed
  const alreadyReviewed = productId
    ? await reviewService.hasReviewed(ctx.visitorId, productId)
    : false;

  if (alreadyReviewed) {
    return {
      success: true,
      data: {
        alreadyReviewed: true,
        message: `You've already reviewed "${productName}". Thank you for your feedback!`,
      },
    };
  }

  // Submit the review
  const review = await reviewService.submitReview({
    productId: productId || `prod_${productName.toLowerCase().replace(/\s+/g, '_')}`,
    productName,
    orderId,
    visitorId: ctx.visitorId,
    rating,
    reviewText: reviewText || `Rated ${rating}/5 stars`,
  });

  const ratingEmoji = rating >= 4 ? '🌟' : rating >= 3 ? '⭐' : '😔';

  log.info({
    reviewId: review.reviewId,
    productId: review.productId,
    rating,
  }, 'Product review collected');

  return {
    success: true,
    data: {
      reviewSubmitted: true,
      reviewId: review.reviewId,
      productName: review.productName,
      rating: review.rating,
      verified: review.verified,
      message: `${ratingEmoji} Thank you for your ${review.rating}-star review of "${review.productName}"! Your feedback helps other customers.`,
    },
  };
};

export const collectProductReviewTool: ToolDefinition = {
  name: 'collect_product_review',
  version: '1.0.0',
  description:
    'Collect a product review (star rating + text feedback) from the customer. Use when customer says "I want to leave a review", after delivery confirmation, or when they share product feedback. Prompts for rating if not provided.',
  inputSchema: {
    type: 'object',
    properties: {
      product_id: {
        type: 'string',
        description: 'Product ID to review (optional if product_name is provided).',
      },
      product_name: {
        type: 'string',
        description: 'Product name being reviewed.',
      },
      rating: {
        type: 'number',
        description: 'Star rating 1-5 (1=poor, 5=excellent).',
      },
      review_text: {
        type: 'string',
        description: 'Customer review text/comments.',
      },
      order_id: {
        type: 'string',
        description: 'Order ID for verified purchase badge.',
      },
    },
    required: [],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      reviewSubmitted: { type: 'boolean' },
      reviewId: { type: 'string' },
      rating: { type: 'number' },
      message: { type: 'string' },
    },
  },
  authLevel: 'none',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.collect_product_review',
  handler,
};
