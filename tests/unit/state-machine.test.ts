import { StateMachine } from '../../src/orchestrator/state-machine';

describe('StateMachine', () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  describe('transition', () => {
    it('should allow NEW -> ACTIVE_QA', () => {
      const result = sm.transition('conv-1', 'NEW', 'ACTIVE_QA', 'greeting');
      expect(result.newState).toBe('ACTIVE_QA');
      expect(result.event).not.toBeNull();
      expect(result.event!.from).toBe('NEW');
      expect(result.event!.to).toBe('ACTIVE_QA');
    });

    it('should allow NEW -> ESCALATED', () => {
      const result = sm.transition('conv-1', 'NEW', 'ESCALATED', 'request_human');
      expect(result.newState).toBe('ESCALATED');
    });

    it('should allow ACTIVE_QA -> LEAD_QUALIFICATION', () => {
      const result = sm.transition('conv-1', 'ACTIVE_QA', 'LEAD_QUALIFICATION', 'product_interest');
      expect(result.newState).toBe('LEAD_QUALIFICATION');
    });

    it('should allow ACTIVE_QA -> RESOLVED', () => {
      const result = sm.transition('conv-1', 'ACTIVE_QA', 'RESOLVED', 'goodbye');
      expect(result.newState).toBe('RESOLVED');
    });

    it('should reject ESCALATED -> ACTIVE_QA (invalid)', () => {
      const result = sm.transition('conv-1', 'ESCALATED', 'ACTIVE_QA', 'test');
      expect(result.newState).toBe('ESCALATED'); // stays in current state
      expect(result.event).toBeNull();
    });

    it('should allow RESOLVED -> ACTIVE_QA (reopen)', () => {
      const result = sm.transition('conv-1', 'RESOLVED', 'ACTIVE_QA', 'new_question');
      expect(result.newState).toBe('ACTIVE_QA');
    });

    it('should return same state if target equals current', () => {
      const result = sm.transition('conv-1', 'ACTIVE_QA', 'ACTIVE_QA', 'same');
      expect(result.newState).toBe('ACTIVE_QA');
      expect(result.event).toBeNull();
    });

    it('should reject NEW -> RESOLVED (invalid direct jump)', () => {
      const result = sm.transition('conv-1', 'NEW', 'RESOLVED', 'test');
      expect(result.newState).toBe('NEW');
      expect(result.event).toBeNull();
    });

    // ─── Dentalkart: New state transitions ───

    it('should allow NEW -> ORDER_INQUIRY', () => {
      const result = sm.transition('conv-1', 'NEW', 'ORDER_INQUIRY', 'order_status');
      expect(result.newState).toBe('ORDER_INQUIRY');
    });

    it('should allow NEW -> SHIPMENT_TRACKING', () => {
      const result = sm.transition('conv-1', 'NEW', 'SHIPMENT_TRACKING', 'track_shipment');
      expect(result.newState).toBe('SHIPMENT_TRACKING');
    });

    it('should allow NEW -> RETURN_REFUND', () => {
      const result = sm.transition('conv-1', 'NEW', 'RETURN_REFUND', 'return_request');
      expect(result.newState).toBe('RETURN_REFUND');
    });

    it('should allow NEW -> PRODUCT_INQUIRY', () => {
      const result = sm.transition('conv-1', 'NEW', 'PRODUCT_INQUIRY', 'product_search');
      expect(result.newState).toBe('PRODUCT_INQUIRY');
    });

    it('should allow ORDER_INQUIRY -> SHIPMENT_TRACKING', () => {
      const result = sm.transition('conv-1', 'ORDER_INQUIRY', 'SHIPMENT_TRACKING', 'track_shipment');
      expect(result.newState).toBe('SHIPMENT_TRACKING');
    });

    it('should allow ORDER_INQUIRY -> RETURN_REFUND', () => {
      const result = sm.transition('conv-1', 'ORDER_INQUIRY', 'RETURN_REFUND', 'return_request');
      expect(result.newState).toBe('RETURN_REFUND');
    });

    it('should allow ORDER_INQUIRY -> ESCALATED', () => {
      const result = sm.transition('conv-1', 'ORDER_INQUIRY', 'ESCALATED', 'complaint');
      expect(result.newState).toBe('ESCALATED');
    });

    it('should allow ORDER_INQUIRY -> RESOLVED', () => {
      const result = sm.transition('conv-1', 'ORDER_INQUIRY', 'RESOLVED', 'resolved');
      expect(result.newState).toBe('RESOLVED');
    });

    it('should allow SHIPMENT_TRACKING -> RETURN_REFUND', () => {
      const result = sm.transition('conv-1', 'SHIPMENT_TRACKING', 'RETURN_REFUND', 'return_request');
      expect(result.newState).toBe('RETURN_REFUND');
    });

    it('should allow RETURN_REFUND -> ESCALATED', () => {
      const result = sm.transition('conv-1', 'RETURN_REFUND', 'ESCALATED', 'refund_amount_mismatch');
      expect(result.newState).toBe('ESCALATED');
    });

    it('should allow PRODUCT_INQUIRY -> LEAD_QUALIFICATION', () => {
      const result = sm.transition('conv-1', 'PRODUCT_INQUIRY', 'LEAD_QUALIFICATION', 'bulk_quote');
      expect(result.newState).toBe('LEAD_QUALIFICATION');
    });

    it('should allow RESOLVED -> ORDER_INQUIRY (reopen with new order question)', () => {
      const result = sm.transition('conv-1', 'RESOLVED', 'ORDER_INQUIRY', 'order_status');
      expect(result.newState).toBe('ORDER_INQUIRY');
    });
  });

  describe('resolveTargetState', () => {
    // ─── General ───
    it('should return ACTIVE_QA for greeting when in NEW', () => {
      expect(sm.resolveTargetState('NEW', 'greeting', false)).toBe('ACTIVE_QA');
    });

    it('should return ESCALATED when shouldEscalate is true', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'any', true)).toBe('ESCALATED');
    });

    // ─── Dentalkart: Order Inquiry intents ───
    it('should return ORDER_INQUIRY for order_status', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'order_status', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for order_delayed', () => {
      expect(sm.resolveTargetState('NEW', 'order_delayed', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for cancel_order', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'cancel_order', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for modify_order', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'modify_order', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for missing_item', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'missing_item', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for wrong_product', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'wrong_product', false)).toBe('ORDER_INQUIRY');
    });

    it('should return ORDER_INQUIRY for damaged_product', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'damaged_product', false)).toBe('ORDER_INQUIRY');
    });

    // ─── Dentalkart: Shipment Tracking intents ───
    it('should return SHIPMENT_TRACKING for track_shipment', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'track_shipment', false)).toBe('SHIPMENT_TRACKING');
    });

    it('should return SHIPMENT_TRACKING for delivery_status', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'delivery_status', false)).toBe('SHIPMENT_TRACKING');
    });

    it('should return SHIPMENT_TRACKING for failed_delivery', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'failed_delivery', false)).toBe('SHIPMENT_TRACKING');
    });

    // ─── Dentalkart: Return / Refund intents ───
    it('should return RETURN_REFUND for return_request', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'return_request', false)).toBe('RETURN_REFUND');
    });

    it('should return RETURN_REFUND for refund_status', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'refund_status', false)).toBe('RETURN_REFUND');
    });

    it('should return RETURN_REFUND for replacement_request', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'replacement_request', false)).toBe('RETURN_REFUND');
    });

    it('should return RETURN_REFUND for refund_amount_mismatch', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'refund_amount_mismatch', false)).toBe('RETURN_REFUND');
    });

    // ─── Dentalkart: Product Inquiry intents ───
    it('should return PRODUCT_INQUIRY for product_search', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'product_search', false)).toBe('PRODUCT_INQUIRY');
    });

    it('should return PRODUCT_INQUIRY for product_out_of_stock', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'product_out_of_stock', false)).toBe('PRODUCT_INQUIRY');
    });

    it('should return PRODUCT_INQUIRY for bulk_quote', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'bulk_quote', false)).toBe('PRODUCT_INQUIRY');
    });

    it('should return PRODUCT_INQUIRY for pricing_question', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'pricing_question', false)).toBe('PRODUCT_INQUIRY');
    });

    // ─── Support / Legacy intents ───
    it('should return SUPPORT_TRIAGE for app_web_issue', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'app_web_issue', false)).toBe('SUPPORT_TRIAGE');
    });

    it('should return SUPPORT_TRIAGE for payment_issue', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'payment_issue', false)).toBe('SUPPORT_TRIAGE');
    });

    it('should return SUPPORT_TRIAGE for warranty_service', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'warranty_service', false)).toBe('SUPPORT_TRIAGE');
    });

    it('should return MEETING_BOOKING for book_demo', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'book_demo', false)).toBe('MEETING_BOOKING');
    });

    it('should return RESOLVED for goodbye', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'goodbye', false)).toBe('RESOLVED');
    });

    it('should return RESOLVED for issue_resolved', () => {
      expect(sm.resolveTargetState('ORDER_INQUIRY', 'issue_resolved', false)).toBe('RESOLVED');
    });

    it('should return ESCALATED for complaint intent', () => {
      expect(sm.resolveTargetState('ACTIVE_QA', 'complaint', false)).toBe('ESCALATED');
    });

    it('should stay in current state for unknown intent', () => {
      expect(sm.resolveTargetState('ORDER_INQUIRY', 'unknown_xyz', false)).toBe('ORDER_INQUIRY');
    });
  });
});
