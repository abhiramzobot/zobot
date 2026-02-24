import { ConversationState } from '../config/types';
import { STATE_TRANSITIONS, StateTransitionEvent } from './types';
import { logger } from '../observability/logger';
import { stateTransitions } from '../observability/metrics';

export class StateMachine {
  /**
   * Attempt a state transition. Returns the new state if valid, or the current state if not.
   */
  transition(
    conversationId: string,
    currentState: ConversationState,
    targetState: ConversationState,
    reason: string,
  ): { newState: ConversationState; event: StateTransitionEvent | null } {
    if (currentState === targetState) {
      return { newState: currentState, event: null };
    }

    const allowed = STATE_TRANSITIONS[currentState];
    if (!allowed.includes(targetState)) {
      logger.warn(
        { conversationId, from: currentState, to: targetState, reason },
        'Invalid state transition attempted',
      );
      return { newState: currentState, event: null };
    }

    const event: StateTransitionEvent = {
      conversationId,
      from: currentState,
      to: targetState,
      reason,
      timestamp: Date.now(),
    };

    stateTransitions.inc({ from: currentState, to: targetState });
    logger.info(event, 'State transition');

    return { newState: targetState, event };
  }

  /**
   * Determine the target state based on agent response intent.
   */
  resolveTargetState(
    currentState: ConversationState,
    intent: string,
    shouldEscalate: boolean,
  ): ConversationState {
    if (shouldEscalate) return 'ESCALATED';

    switch (intent) {
      // ─── General / Greeting ───
      case 'greeting':
      case 'general_question':
      case 'faq':
        return currentState === 'NEW' ? 'ACTIVE_QA' : currentState;

      // ─── Dentalkart: Order Inquiry ───
      case 'order_status':
      case 'order_delayed':
      case 'order_issue':
      case 'modify_order':
      case 'cancel_order':
      case 'partial_cancel':
      case 'order_lookup':
      case 'missing_item':
      case 'wrong_product':
      case 'damaged_product':
      case 'invoice_issue':
        return 'ORDER_INQUIRY';

      // ─── Dentalkart: Shipment Tracking ───
      case 'track_shipment':
      case 'delivery_status':
      case 'delivery_delayed':
      case 'failed_delivery':
      case 'shipment_details':
        return 'SHIPMENT_TRACKING';

      // ─── Dentalkart: Return / Refund ───
      case 'return_request':
      case 'return_status':
      case 'refund_status':
      case 'refund_delay':
      case 'refund_amount_mismatch':
      case 'refund_link_issue':
      case 'replacement_request':
      case 'replacement_status':
        return 'RETURN_REFUND';

      // ─── Dentalkart: Product Inquiry ───
      case 'product_search':
      case 'product_inquiry':
      case 'product_out_of_stock':
      case 'product_not_listed':
      case 'bulk_quote':
      case 'product_interest':
      case 'pricing_question':
        return 'PRODUCT_INQUIRY';

      // ─── Lead Qualification ───
      case 'lead_inquiry':
        return 'LEAD_QUALIFICATION';

      // ─── Meetings / Demos ───
      case 'schedule_meeting':
      case 'book_demo':
        return 'MEETING_BOOKING';

      // ─── Support Triage ───
      case 'support_request':
      case 'bug_report':
      case 'technical_issue':
      case 'app_web_issue':
      case 'payment_issue':
      case 'warranty_service':
      case 'repair_request':
      case 'installation_request':
        return 'SUPPORT_TRIAGE';

      // ─── Resolution ───
      case 'resolved':
      case 'goodbye':
      case 'thank_you':
      case 'issue_resolved':
        return 'RESOLVED';

      // ─── Escalation ───
      case 'request_human':
      case 'complaint':
      case 'legal_question':
      case 'contract_negotiation':
      case 'discount_request':
        return 'ESCALATED';

      default:
        return currentState === 'NEW' ? 'ACTIVE_QA' : currentState;
    }
  }
}

export const stateMachine = new StateMachine();
