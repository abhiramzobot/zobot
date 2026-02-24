/**
 * Razorpay Client (Phase 4A)
 *
 * Payment Links API integration.
 */

import { PaymentLinkRequest, PaymentLinkResponse } from './types';
import { logger } from '../observability/logger';

export class RazorpayClient {
  private readonly log = logger.child({ component: 'razorpay' });

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly baseUrl: string = 'https://api.razorpay.com/v1',
  ) {}

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLinkResponse> {
    this.log.info({ orderId: request.orderId, amount: request.amount }, 'Creating payment link');

    try {
      const response = await fetch(`${this.baseUrl}/payment_links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: request.amount * 100, // Razorpay uses paise
          currency: request.currency || 'INR',
          description: request.description,
          customer: {
            name: request.customerName,
            email: request.customerEmail,
            contact: request.customerPhone,
          },
          notify: { sms: !!request.customerPhone, email: !!request.customerEmail },
          expire_by: Math.floor(Date.now() / 1000) + request.expiryMinutes * 60,
          reference_id: request.orderId,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Razorpay API error: ${response.status} ${err}`);
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        linkId: data.id as string,
        shortUrl: data.short_url as string,
        amount: request.amount,
        currency: request.currency || 'INR',
        status: 'created',
        expiresAt: (data.expire_by as number) * 1000,
      };
    } catch (err) {
      this.log.error({ err }, 'Razorpay payment link creation failed');
      throw err;
    }
  }

  async getPaymentLink(linkId: string): Promise<PaymentLinkResponse> {
    const response = await fetch(`${this.baseUrl}/payment_links/${linkId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
    });

    const data = await response.json() as Record<string, unknown>;
    return {
      linkId: data.id as string,
      shortUrl: data.short_url as string,
      amount: (data.amount as number) / 100,
      currency: data.currency as string,
      status: data.status as PaymentLinkResponse['status'],
      expiresAt: ((data.expire_by as number) ?? 0) * 1000,
    };
  }
}
