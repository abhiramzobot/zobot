import { AgentResponse } from '../config/types';

/**
 * JSON Schema for the agent response contract.
 * The LLM is instructed to return JSON matching this schema.
 */
export const RESPONSE_CONTRACT_SCHEMA = {
  type: 'object',
  properties: {
    user_facing_message: {
      type: 'string',
      description: 'The message to send to the user.',
    },
    intent: {
      type: 'string',
      description: 'Classified intent of the user message (e.g., greeting, product_interest, support_request, schedule_meeting, request_human, complaint, goodbye).',
    },
    extracted_fields: {
      type: 'object',
      description: 'Key-value pairs of extracted lead/support fields (name, email, phone, company, productInterest, etc.).',
      additionalProperties: true,
    },
    should_escalate: {
      type: 'boolean',
      description: 'Whether the conversation should be escalated to a human agent.',
    },
    escalation_reason: {
      type: 'string',
      description: 'Reason for escalation, if should_escalate is true.',
    },
    ticket_update_payload: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['Open', 'Pending', 'Escalated', 'Resolved'] },
        lead_fields: { type: 'object', additionalProperties: true },
        intent_classification: { type: 'string' },
      },
    },
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['name', 'args'],
      },
      description: 'Tool calls to execute. The orchestrator will execute these safely.',
    },
    // ───── VOC Intelligence Fields (optional) ─────
    detected_language: {
      type: 'string',
      description: 'ISO language code: en, hi, hinglish',
    },
    intent_confidence: {
      type: 'number',
      description: 'Confidence score (0-1) for the primary intent classification.',
    },
    secondary_intents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
      description: 'Other possible intents with confidence scores.',
    },
    sentiment: {
      type: 'object',
      properties: {
        label: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        score: { type: 'number' },
        emotion: { type: 'string' },
      },
      description: 'Sentiment analysis of the customer message.',
    },
    extracted_entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
      description: 'Entities extracted from the message (order numbers, phones, etc.).',
    },
    confidence_score: {
      type: 'number',
      description: 'Overall confidence (0-1) in this response.',
    },
    clarification_needed: {
      type: 'boolean',
      description: 'Whether the response requires further clarification from the customer.',
    },
    customer_stage: {
      type: 'string',
      description: 'Customer lifecycle stage: browsing, pre_purchase, post_purchase, issue_resolution, at_risk, returning_customer.',
    },
    // ───── Resolution Engine Fields ─────
    resolution_receipt: {
      type: 'object',
      properties: {
        action_taken: { type: 'string' },
        reference_id: { type: 'string' },
        expected_timeline: { type: 'string' },
        next_steps: { type: 'string' },
      },
      description: 'Confirmation receipt after completing an action.',
    },
    fcr_achieved: {
      type: 'boolean',
      description: 'Whether the issue was fully resolved in this response (First Contact Resolution).',
    },
  },
  required: ['user_facing_message', 'intent', 'extracted_fields', 'should_escalate', 'tool_calls'],
} as const;

/**
 * Parse the LLM response into a typed AgentResponse.
 * Handles both clean JSON and markdown-wrapped JSON.
 */
export function parseAgentResponse(raw: string): AgentResponse {
  let jsonStr = raw.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  return {
    userFacingMessage: String(parsed.user_facing_message ?? ''),
    intent: String(parsed.intent ?? 'unknown'),
    extractedFields: parsed.extracted_fields ?? {},
    shouldEscalate: Boolean(parsed.should_escalate),
    escalationReason: parsed.escalation_reason,
    ticketUpdatePayload: {
      summary: parsed.ticket_update_payload?.summary,
      tags: parsed.ticket_update_payload?.tags,
      status: parsed.ticket_update_payload?.status,
      leadFields: parsed.ticket_update_payload?.lead_fields,
      intentClassification: parsed.ticket_update_payload?.intent_classification,
    },
    toolCalls: Array.isArray(parsed.tool_calls)
      ? parsed.tool_calls.map((tc: { name: string; args: Record<string, unknown> }) => ({
          // Strip "functions." prefix if LLM adds it (OpenAI function calling artifact)
          name: String(tc.name).replace(/^functions\./, ''),
          args: tc.args ?? {},
        }))
      : [],
    // ───── VOC Intelligence Fields (safe extraction) ─────
    detectedLanguage: parsed.detected_language ?? undefined,
    intentConfidence: typeof parsed.intent_confidence === 'number' ? parsed.intent_confidence : undefined,
    secondaryIntents: Array.isArray(parsed.secondary_intents) ? parsed.secondary_intents : undefined,
    sentiment: parsed.sentiment ?? undefined,
    extractedEntities: Array.isArray(parsed.extracted_entities) ? parsed.extracted_entities : undefined,
    confidenceScore: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : undefined,
    clarificationNeeded: typeof parsed.clarification_needed === 'boolean' ? parsed.clarification_needed : undefined,
    customerStage: parsed.customer_stage ?? undefined,
    // ───── Resolution Engine Fields ─────
    resolutionReceipt: parsed.resolution_receipt
      ? {
          actionTaken: String(parsed.resolution_receipt.action_taken ?? ''),
          referenceId: parsed.resolution_receipt.reference_id,
          expectedTimeline: parsed.resolution_receipt.expected_timeline,
          nextSteps: parsed.resolution_receipt.next_steps,
        }
      : undefined,
    fcrAchieved: typeof parsed.fcr_achieved === 'boolean' ? parsed.fcr_achieved : undefined,
  };
}
