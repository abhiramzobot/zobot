/**
 * Customer 360 Types (Phase 3A)
 */

export interface CustomerProfile {
  customerId: string;
  /** Customer tier/segment */
  segment: 'vip' | 'loyal' | 'regular' | 'new' | 'at_risk';
  /** Lifetime value */
  ltv: number;
  /** Total order count */
  totalOrders: number;
  /** Return rate percentage */
  returnRate: number;
  /** Average CSAT score */
  avgCsat: number;
  /** Most recent order date */
  lastOrderDate?: string;
  /** Preferred channel */
  preferredChannel?: string;
  /** Product categories of interest */
  productCategories: string[];
  /** Active issues count */
  activeIssues: number;
  /** Previous conversation count */
  conversationCount: number;
  /** Personalization rules applied */
  personalizations: PersonalizationRule[];
  /** Loaded at timestamp */
  loadedAt: number;
}

export interface PersonalizationRule {
  id: string;
  condition: string;
  action: string;
  priority: number;
}

export interface Customer360Config {
  enabled: boolean;
  /** Cache profile for this many seconds */
  cacheTtlSeconds: number;
  /** Enable VIP detection */
  vipDetection: boolean;
  /** LTV threshold for VIP */
  vipLtvThreshold: number;
}
