/**
 * Confidence-Based Response Router (Phase 5)
 *
 * Uses confidence scores from the LLM response to minimize unnecessary
 * clarification and route low-confidence responses appropriately.
 *
 * Decision Matrix (from Resolution Engine):
 * | Confidence | Clarification Count | Action                                    |
 * |-----------|---------------------|-------------------------------------------|
 * | >= 0.8    | Any                 | Respond directly                          |
 * | 0.5-0.8   | Any                 | Respond + soft fallback disclaimer        |
 * | < 0.5     | 0                   | One reasonable attempt                    |
 * | < 0.5     | >= 1                | Escalate (don't loop)                     |
 */

import { AgentResponse } from '../config/types';
import { logger } from '../observability/logger';

export type ConfidenceAction = 'respond' | 'respond_with_disclaimer' | 'attempt' | 'escalate';

export interface ConfidencePolicy {
  highThreshold: number;    // default: 0.8
  mediumThreshold: number;  // default: 0.5
}

export interface ConfidenceResult {
  action: ConfidenceAction;
  confidenceScore: number;
  disclaimer?: string;
}

const DEFAULT_POLICY: ConfidencePolicy = {
  highThreshold: 0.8,
  mediumThreshold: 0.5,
};

const DISCLAIMER_EN = "If this doesn't fully address your concern, please let me know and I'll connect you with our support team.";
const DISCLAIMER_HI = "Agar yeh aapki samasya ka poora samadhan nahi karta, toh mujhe bataiye aur main aapko hamari support team se connect karunga.";

export class ConfidenceRouter {
  private readonly log = logger.child({ component: 'confidence-router' });
  private readonly policy: ConfidencePolicy;

  constructor(policy?: Partial<ConfidencePolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Evaluate the LLM response confidence and determine the appropriate action.
   */
  evaluate(
    response: AgentResponse,
    clarificationCount: number,
    detectedLanguage?: string,
  ): ConfidenceResult {
    const confidence = response.confidenceScore ?? 0.75; // Default to medium-high if not provided

    // High confidence: respond directly
    if (confidence >= this.policy.highThreshold) {
      return { action: 'respond', confidenceScore: confidence };
    }

    // Medium confidence: respond with soft fallback disclaimer
    if (confidence >= this.policy.mediumThreshold) {
      const disclaimer = detectedLanguage === 'hi' || detectedLanguage === 'hinglish'
        ? DISCLAIMER_HI
        : DISCLAIMER_EN;
      return { action: 'respond_with_disclaimer', confidenceScore: confidence, disclaimer };
    }

    // Low confidence: attempt once or escalate if already tried
    if (clarificationCount >= 1) {
      this.log.info({ confidence, clarificationCount }, 'Low confidence + previous clarification → escalate');
      return { action: 'escalate', confidenceScore: confidence };
    }

    return { action: 'attempt', confidenceScore: confidence };
  }

  /**
   * Apply the confidence routing result to the agent response.
   * Returns the modified response (or signals escalation).
   */
  apply(response: AgentResponse, result: ConfidenceResult): AgentResponse {
    switch (result.action) {
      case 'respond':
        // No modification needed
        return response;

      case 'respond_with_disclaimer':
        // Append soft disclaimer to user-facing message
        if (result.disclaimer) {
          return {
            ...response,
            userFacingMessage: `${response.userFacingMessage}\n\n${result.disclaimer}`,
          };
        }
        return response;

      case 'attempt':
        // Let the response through as-is (one attempt)
        return response;

      case 'escalate':
        // Override response to trigger escalation
        return {
          ...response,
          shouldEscalate: true,
          escalationReason: response.escalationReason ?? `Low confidence (${result.confidenceScore.toFixed(2)}) after clarification attempt`,
        };

      default:
        return response;
    }
  }
}
