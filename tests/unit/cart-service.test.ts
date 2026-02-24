import { CartService } from '../../src/cart/cart-service';

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    service = new CartService();
  });

  describe('getOrCreateCart', () => {
    it('should create a new cart for new visitor', async () => {
      const cart = await service.getOrCreateCart('visitor-1', 'conv-1');
      expect(cart.cartId).toMatch(/^cart-visitor-1/);
      expect(cart.visitorId).toBe('visitor-1');
      expect(cart.items).toEqual([]);
      expect(cart.appliedCoupons).toEqual([]);
    });

    it('should return existing cart for known visitor', async () => {
      const first = await service.getOrCreateCart('visitor-1', 'conv-1');
      const second = await service.getOrCreateCart('visitor-1', 'conv-1');
      expect(first.cartId).toBe(second.cartId);
    });
  });

  describe('addItem', () => {
    const sampleItem = {
      productId: 'prod-1',
      name: 'Dental Composite',
      sku: 'DC-001',
      price: 1500,
      sellingPrice: 1299,
      imageUrl: 'https://example.com/image.jpg',
      inStock: true,
    };

    it('should add a new item to cart', async () => {
      const result = await service.addItem('v1', 'c1', sampleItem);
      expect(result.added).toBe(true);
      expect(result.cart.items.length).toBe(1);
      expect(result.cart.items[0].name).toBe('Dental Composite');
      expect(result.cart.items[0].quantity).toBe(1);
    });

    it('should increment quantity for existing item', async () => {
      await service.addItem('v1', 'c1', sampleItem);
      const result = await service.addItem('v1', 'c1', { ...sampleItem, quantity: 3 });
      expect(result.added).toBe(true);
      expect(result.cart.items[0].quantity).toBe(4); // 1 + 3
      expect(result.message).toContain('quantity to 4');
    });

    it('should reject out-of-stock items', async () => {
      const result = await service.addItem('v1', 'c1', { ...sampleItem, inStock: false });
      expect(result.added).toBe(false);
      expect(result.message).toContain('out of stock');
    });

    it('should support custom quantity', async () => {
      const result = await service.addItem('v1', 'c1', { ...sampleItem, quantity: 5 });
      expect(result.cart.items[0].quantity).toBe(5);
    });
  });

  describe('removeItem', () => {
    it('should remove an existing item', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item 1', price: 100, sellingPrice: 90, inStock: true,
      });
      const result = await service.removeItem('v1', 'p1');
      expect(result.removed).toBe(true);
      expect(result.cart!.items.length).toBe(0);
    });

    it('should handle empty cart', async () => {
      const result = await service.removeItem('v1', 'p1');
      expect(result.removed).toBe(false);
      expect(result.message).toContain('empty');
    });

    it('should handle product not in cart', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item 1', price: 100, sellingPrice: 90, inStock: true,
      });
      const result = await service.removeItem('v1', 'p999');
      expect(result.removed).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('updateQuantity', () => {
    it('should update item quantity', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item 1', price: 100, sellingPrice: 90, inStock: true,
      });
      const result = await service.updateQuantity('v1', 'p1', 5);
      expect(result.updated).toBe(true);
      expect(result.cart!.items[0].quantity).toBe(5);
    });

    it('should remove item when quantity is 0', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item 1', price: 100, sellingPrice: 90, inStock: true,
      });
      const result = await service.updateQuantity('v1', 'p1', 0);
      expect(result.updated).toBe(true);
      expect(result.cart!.items.length).toBe(0);
    });

    it('should handle empty cart', async () => {
      const result = await service.updateQuantity('v1', 'p1', 3);
      expect(result.updated).toBe(false);
    });
  });

  describe('getCartSummary', () => {
    it('should calculate correct subtotal and savings', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item 1', price: 200, sellingPrice: 150, inStock: true, quantity: 2,
      });
      await service.addItem('v1', 'c1', {
        productId: 'p2', name: 'Item 2', price: 500, sellingPrice: 400, inStock: true,
      });

      const summary = await service.getCartSummary('v1');
      expect(summary.itemCount).toBe(2);
      expect(summary.totalItems).toBe(3); // 2 + 1
      expect(summary.subtotal).toBe(700); // 150*2 + 400
      expect(summary.totalSavings).toBe(200); // (200-150)*2 + (500-400)*1
    });

    it('should return empty summary for no cart', async () => {
      const summary = await service.getCartSummary('nonexistent');
      expect(summary.itemCount).toBe(0);
      expect(summary.subtotal).toBe(0);
    });

    it('should include coupon savings', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item', price: 1000, sellingPrice: 900, inStock: true,
      });
      await service.applyCoupon('v1', {
        code: 'TEST10', discountAmount: 90, type: 'percentage', label: '10% off',
      });

      const summary = await service.getCartSummary('v1');
      expect(summary.couponSavings).toBe(90);
      expect(summary.discountedSubtotal).toBe(810); // 900 - 90
    });
  });

  describe('applyCoupon', () => {
    it('should apply coupon to cart', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item', price: 1000, sellingPrice: 900, inStock: true,
      });
      const result = await service.applyCoupon('v1', {
        code: 'SAVE10', discountAmount: 100, type: 'percentage',
      });
      expect(result.applied).toBe(true);
    });

    it('should reject duplicate coupon', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item', price: 1000, sellingPrice: 900, inStock: true,
      });
      await service.applyCoupon('v1', {
        code: 'SAVE10', discountAmount: 100, type: 'percentage',
      });
      const result = await service.applyCoupon('v1', {
        code: 'SAVE10', discountAmount: 100, type: 'percentage',
      });
      expect(result.applied).toBe(false);
      expect(result.message).toContain('already applied');
    });
  });

  describe('removeCoupon', () => {
    it('should remove applied coupon', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item', price: 1000, sellingPrice: 900, inStock: true,
      });
      await service.applyCoupon('v1', {
        code: 'SAVE10', discountAmount: 100, type: 'percentage',
      });
      const result = await service.removeCoupon('v1', 'SAVE10');
      expect(result.removed).toBe(true);
    });
  });

  describe('clearCart', () => {
    it('should clear all items', async () => {
      await service.addItem('v1', 'c1', {
        productId: 'p1', name: 'Item', price: 100, sellingPrice: 90, inStock: true,
      });
      const result = await service.clearCart('v1');
      expect(result.message).toContain('cleared');
      const cart = await service.getCart('v1');
      expect(cart).toBeNull();
    });
  });
});
