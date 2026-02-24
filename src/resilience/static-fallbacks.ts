/**
 * Static Fallback Responses (Phase 1C)
 *
 * Cached responses for top 10 intents when dependencies are down.
 */

const STATIC_RESPONSES = new Map<string, string>([
  ['order_status', 'I\'m currently unable to look up order details due to a temporary system issue. Please try again in a few minutes, or you can check your order status at https://dentalkart.com/account/orders. For urgent help, please email support@dentalkart.com.'],

  ['track_shipment', 'Our shipment tracking system is temporarily unavailable. You can track your order directly at the courier website using your AWB number from your order confirmation email. We apologize for the inconvenience.'],

  ['return_refund', 'I\'m unable to check return/refund status right now due to a temporary issue. Please email support@dentalkart.com with your order number and we\'ll get back to you within 24 hours.'],

  ['cancel_order', 'Our order management system is temporarily unavailable. To cancel an order, please email support@dentalkart.com with your order number as soon as possible. Orders can only be cancelled before dispatch.'],

  ['product_inquiry', 'I\'m having trouble accessing product information right now. Please browse our catalog at https://dentalkart.com or try again in a few minutes.'],

  ['payment_issue', 'I\'m unable to access payment details at the moment. For payment-related concerns, please email accounts@dentalkart.com with your order number and payment reference.'],

  ['greeting', 'Hello! Welcome to Dentalkart. I\'m experiencing some technical difficulties right now, but I\'m still here to help with basic questions. For order-specific queries, please try again in a few minutes.'],

  ['escalation', 'I understand you need additional help. Let me connect you with a team member who can assist you directly.'],

  ['complaint', 'I\'m sorry to hear about your experience. I want to make sure your concern is addressed properly. Let me connect you with our support team right away.'],

  ['general_query', 'I\'m experiencing some temporary technical difficulties. For immediate assistance, please email support@dentalkart.com or call our helpline. I should be back to full capacity shortly.'],
]);

export function getStaticFallback(intent: string): string | undefined {
  return STATIC_RESPONSES.get(intent);
}

export function getDefaultFallback(): string {
  return 'I\'m currently experiencing technical difficulties and cannot process your request fully. Please try again in a few minutes, or contact us at support@dentalkart.com for immediate assistance. We apologize for the inconvenience.';
}

export function getAllFallbackIntents(): string[] {
  return Array.from(STATIC_RESPONSES.keys());
}
