/**
 * AI Product Recommendation Types (Enhancement v5 — A4)
 */

export type RecommendationType =
  | 'cross_sell'      // Complementary products (dental mirror → sterilization pouch)
  | 'upsell'          // Higher-value alternative (1pc → bulk pack)
  | 'complementary'   // Frequently bought together
  | 'reorder'         // Past purchase reorder suggestion
  | 'trending'        // Popular in category
  | 'similar';        // Similar products

export interface RecommendationContext {
  /** Current cart product IDs */
  cartProductIds?: (string | number)[];
  /** Current cart product names */
  cartProductNames?: string[];
  /** Current cart categories */
  cartCategories?: string[];
  /** Past order product IDs */
  orderHistoryProductIds?: (string | number)[];
  /** Current conversation query */
  currentQuery?: string;
  /** Customer segment */
  customerSegment?: string;
  /** Visitor ID */
  visitorId?: string;
}

export interface RecommendedProduct {
  productId: string | number;
  name: string;
  price: number;
  sellingPrice: number;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  inStock: boolean;
}

export interface Recommendation {
  type: RecommendationType;
  reason: string;           // "Frequently bought with Dental Composite Kit"
  confidence: number;       // 0-1
  product: RecommendedProduct;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  context: string;          // Summary of what was considered
  strategy: string;         // Which strategy produced results
}
