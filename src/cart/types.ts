/**
 * Cart Types — In-Chat Add-to-Cart Feature
 *
 * Enables customers to add products to a shopping cart directly from
 * chat search results and manage their cart within the conversation.
 */

export interface CartItem {
  productId: string | number;
  name: string;
  sku?: string;
  price: number;
  sellingPrice: number;
  quantity: number;
  imageUrl?: string;
  productUrl?: string;
  discount?: { value: number; label?: string };
  inStock: boolean;
  addedAt: number;
}

export interface AppliedCartCoupon {
  code: string;
  discountAmount: number;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  label?: string;
}

export interface Cart {
  cartId: string;
  visitorId: string;
  conversationId: string;
  items: CartItem[];
  appliedCoupons: AppliedCartCoupon[];
  createdAt: number;
  updatedAt: number;
}

export interface CartSummary {
  itemCount: number;
  totalItems: number; // sum of quantities
  subtotal: number;
  totalSavings: number;
  couponSavings: number;
  discountedSubtotal: number;
  appliedCoupons: AppliedCartCoupon[];
  items: Array<{
    productId: string | number;
    name: string;
    quantity: number;
    sellingPrice: number;
    lineTotal: number;
  }>;
}

export interface CartStore {
  getCart(visitorId: string): Promise<Cart | null>;
  saveCart(cart: Cart): Promise<void>;
  deleteCart(visitorId: string): Promise<void>;
  getAllCarts?(): Promise<Cart[]>;
}
