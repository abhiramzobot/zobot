/**
 * Payment Types (Phase 4A)
 */

export interface PaymentLinkRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  description: string;
  /** Link expiry in minutes */
  expiryMinutes: number;
}

export interface PaymentLinkResponse {
  linkId: string;
  shortUrl: string;
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'expired' | 'cancelled';
  expiresAt: number;
}

export interface PaymentWebhookPayload {
  event: 'payment.captured' | 'payment.failed' | 'payment_link.expired';
  payload: {
    payment_link?: { entity: { id: string; status: string; amount: number } };
    payment?: { entity: { id: string; amount: number; status: string; method: string } };
  };
}
