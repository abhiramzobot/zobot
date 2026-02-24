/**
 * Cart Service — In-Chat Shopping Cart Management
 *
 * Provides cart operations: add, remove, update quantity, view, clear.
 * Uses in-memory store with optional Redis persistence.
 */

import { Cart, CartItem, CartSummary, CartStore, AppliedCartCoupon } from './types';
import { logger } from '../observability/logger';

const log = logger.child({ component: 'cart-service' });

/** In-memory cart store (default fallback) */
class InMemoryCartStore implements CartStore {
  private carts: Map<string, Cart> = new Map();

  async getCart(visitorId: string): Promise<Cart | null> {
    return this.carts.get(visitorId) ?? null;
  }

  async saveCart(cart: Cart): Promise<void> {
    this.carts.set(cart.visitorId, cart);
  }

  async deleteCart(visitorId: string): Promise<void> {
    this.carts.delete(visitorId);
  }

  async getAllCarts(): Promise<Cart[]> {
    return Array.from(this.carts.values());
  }
}

export class CartService {
  private store: CartStore;

  constructor(store?: CartStore) {
    this.store = store ?? new InMemoryCartStore();
  }

  /** Get or create a cart for a visitor */
  async getOrCreateCart(visitorId: string, conversationId: string): Promise<Cart> {
    let cart = await this.store.getCart(visitorId);
    if (!cart) {
      cart = {
        cartId: `cart-${visitorId}-${Date.now()}`,
        visitorId,
        conversationId,
        items: [],
        appliedCoupons: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.store.saveCart(cart);
      log.info({ visitorId, cartId: cart.cartId }, 'New cart created');
    }
    return cart;
  }

  /** Add a product to the cart */
  async addItem(
    visitorId: string,
    conversationId: string,
    item: Omit<CartItem, 'addedAt' | 'quantity'> & { quantity?: number },
  ): Promise<{ cart: Cart; added: boolean; message: string }> {
    const cart = await this.getOrCreateCart(visitorId, conversationId);
    const quantity = item.quantity ?? 1;

    if (!item.inStock) {
      return {
        cart,
        added: false,
        message: `Sorry, "${item.name}" is currently out of stock and cannot be added to your cart.`,
      };
    }

    // Check if product already in cart
    const existing = cart.items.find(
      (i) => String(i.productId) === String(item.productId),
    );

    if (existing) {
      existing.quantity += quantity;
      existing.sellingPrice = item.sellingPrice; // Update price in case it changed
      existing.price = item.price;
      cart.updatedAt = Date.now();
      await this.store.saveCart(cart);
      log.info({ visitorId, productId: item.productId, newQty: existing.quantity }, 'Cart item quantity updated');
      return {
        cart,
        added: true,
        message: `Updated "${item.name}" quantity to ${existing.quantity} in your cart.`,
      };
    }

    // Add new item
    cart.items.push({
      ...item,
      quantity,
      addedAt: Date.now(),
    });
    cart.updatedAt = Date.now();
    await this.store.saveCart(cart);

    log.info({ visitorId, productId: item.productId, name: item.name }, 'Item added to cart');
    return {
      cart,
      added: true,
      message: `Added "${item.name}" to your cart. You now have ${cart.items.length} item(s) in your cart.`,
    };
  }

  /** Remove an item from the cart */
  async removeItem(
    visitorId: string,
    productId: string | number,
  ): Promise<{ cart: Cart | null; removed: boolean; message: string }> {
    const cart = await this.store.getCart(visitorId);
    if (!cart || cart.items.length === 0) {
      return { cart: null, removed: false, message: 'Your cart is empty.' };
    }

    const idx = cart.items.findIndex(
      (i) => String(i.productId) === String(productId),
    );
    if (idx === -1) {
      return { cart, removed: false, message: 'Product not found in your cart.' };
    }

    const removed = cart.items.splice(idx, 1)[0];
    cart.updatedAt = Date.now();
    await this.store.saveCart(cart);

    log.info({ visitorId, productId, name: removed.name }, 'Item removed from cart');
    return {
      cart,
      removed: true,
      message: `Removed "${removed.name}" from your cart. ${cart.items.length} item(s) remaining.`,
    };
  }

  /** Update item quantity */
  async updateQuantity(
    visitorId: string,
    productId: string | number,
    quantity: number,
  ): Promise<{ cart: Cart | null; updated: boolean; message: string }> {
    const cart = await this.store.getCart(visitorId);
    if (!cart) {
      return { cart: null, updated: false, message: 'Your cart is empty.' };
    }

    const item = cart.items.find(
      (i) => String(i.productId) === String(productId),
    );
    if (!item) {
      return { cart, updated: false, message: 'Product not found in your cart.' };
    }

    if (quantity <= 0) {
      const removeResult = await this.removeItem(visitorId, productId);
      return { cart: removeResult.cart, updated: removeResult.removed, message: removeResult.message };
    }

    item.quantity = quantity;
    cart.updatedAt = Date.now();
    await this.store.saveCart(cart);

    return {
      cart,
      updated: true,
      message: `Updated "${item.name}" quantity to ${quantity}.`,
    };
  }

  /** Get cart summary (includes coupon savings) */
  async getCartSummary(visitorId: string): Promise<CartSummary> {
    const cart = await this.store.getCart(visitorId);
    if (!cart || cart.items.length === 0) {
      return { itemCount: 0, totalItems: 0, subtotal: 0, totalSavings: 0, couponSavings: 0, discountedSubtotal: 0, appliedCoupons: [], items: [] };
    }

    let subtotal = 0;
    let totalSavings = 0;
    let totalItems = 0;

    const items = cart.items.map((item) => {
      const lineTotal = item.sellingPrice * item.quantity;
      const lineSaving = (item.price - item.sellingPrice) * item.quantity;
      subtotal += lineTotal;
      totalSavings += lineSaving > 0 ? lineSaving : 0;
      totalItems += item.quantity;
      return {
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        lineTotal,
      };
    });

    const couponSavings = (cart.appliedCoupons || []).reduce((sum, c) => sum + c.discountAmount, 0);
    const roundedSubtotal = Math.round(subtotal * 100) / 100;
    const discountedSubtotal = Math.max(0, Math.round((subtotal - couponSavings) * 100) / 100);

    return {
      itemCount: cart.items.length,
      totalItems,
      subtotal: roundedSubtotal,
      totalSavings: Math.round(totalSavings * 100) / 100,
      couponSavings: Math.round(couponSavings * 100) / 100,
      discountedSubtotal,
      appliedCoupons: cart.appliedCoupons || [],
      items,
    };
  }

  /** Apply a coupon to the cart */
  async applyCoupon(visitorId: string, coupon: AppliedCartCoupon): Promise<{ applied: boolean; message: string }> {
    const cart = await this.store.getCart(visitorId);
    if (!cart) return { applied: false, message: 'Cart not found.' };

    // Check if coupon already applied
    if (!cart.appliedCoupons) cart.appliedCoupons = [];
    const existing = cart.appliedCoupons.find((c) => c.code === coupon.code);
    if (existing) return { applied: false, message: `Coupon "${coupon.code}" is already applied.` };

    cart.appliedCoupons.push(coupon);
    cart.updatedAt = Date.now();
    await this.store.saveCart(cart);
    log.info({ visitorId, couponCode: coupon.code, discount: coupon.discountAmount }, 'Coupon applied to cart');
    return { applied: true, message: `Coupon "${coupon.code}" applied! You save ₹${coupon.discountAmount.toFixed(2)}.` };
  }

  /** Remove a coupon from the cart */
  async removeCoupon(visitorId: string, code: string): Promise<{ removed: boolean; message: string }> {
    const cart = await this.store.getCart(visitorId);
    if (!cart || !cart.appliedCoupons) return { removed: false, message: 'No coupons applied.' };

    const idx = cart.appliedCoupons.findIndex((c) => c.code === code);
    if (idx === -1) return { removed: false, message: `Coupon "${code}" is not applied.` };

    cart.appliedCoupons.splice(idx, 1);
    cart.updatedAt = Date.now();
    await this.store.saveCart(cart);
    log.info({ visitorId, couponCode: code }, 'Coupon removed from cart');
    return { removed: true, message: `Coupon "${code}" removed.` };
  }

  /** Clear the entire cart */
  async clearCart(visitorId: string): Promise<{ message: string }> {
    await this.store.deleteCart(visitorId);
    log.info({ visitorId }, 'Cart cleared');
    return { message: 'Your cart has been cleared.' };
  }

  /** Get raw cart */
  async getCart(visitorId: string): Promise<Cart | null> {
    return this.store.getCart(visitorId);
  }
}

/** Singleton */
let _cartService: CartService | undefined;

export function initCartService(store?: CartStore): CartService {
  _cartService = new CartService(store);
  return _cartService;
}

export function getCartService(): CartService | undefined {
  return _cartService;
}
