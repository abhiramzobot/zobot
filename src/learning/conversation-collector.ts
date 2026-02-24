import { ConversationRecord } from '../memory/types';
import { ConversationSummary } from './types';
import { LearningStore } from './learning-store';
import { VOCRecord } from '../voc/types';
import { logger } from '../observability/logger';

// PII redaction patterns
const PHONE_REGEX = /\b(\+?91[\s-]?)?[6-9]\d{9}\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Satisfaction detection keywords
const POSITIVE_KEYWORDS = ['thank', 'thanks', 'got it', 'perfect', 'great', 'helpful', 'resolved', 'appreciate', 'awesome', 'dhanyawad', 'shukriya'];
const NEGATIVE_KEYWORDS = ['worst', 'terrible', 'useless', 'pathetic', 'angry', 'fed up', 'waste', 'consumer court', 'legal', 'frustrated', 'bekaar', 'bahut bura'];

/**
 * ConversationCollector captures completed conversations for the learning pipeline.
 *
 * It hooks into the orchestrator and creates ConversationSummary objects when
 * conversations reach terminal states (RESOLVED or ESCALATED).
 *
 * Design: Fire-and-forget async — never blocks the response path.
 */
export class ConversationCollector {
  private log = logger.child({ component: 'conversation-collector' });

  constructor(
    private readonly store: LearningStore,
    private readonly enabled: boolean = true,
  ) {}

  /**
   * Collect a completed conversation for learning analysis.
   * Called asynchronously after conversation state transitions to a terminal state.
   */
  async collect(record: ConversationRecord, tenantId: string = 'default', vocRecords?: VOCRecord[]): Promise<void> {
    if (!this.enabled) return;

    try {
      const summary = this.buildSummary(record, tenantId, vocRecords);
      await this.store.saveSummary(summary);

      this.log.debug({
        conversationId: record.conversationId,
        finalState: record.state,
        turnCount: record.turnCount,
        intents: summary.intents.length,
      }, 'Conversation summary collected');
    } catch (err) {
      // Non-blocking — log and continue
      this.log.error({ err, conversationId: record.conversationId }, 'Failed to collect conversation summary');
    }
  }

  private buildSummary(record: ConversationRecord, tenantId: string, vocRecords?: VOCRecord[]): ConversationSummary {
    const userMessages: string[] = [];
    const botMessages: string[] = [];
    const intents: string[] = [];
    const toolsUsed: string[] = [];

    for (const turn of record.turns) {
      if (turn.role === 'user') {
        // Redact PII from user messages
        userMessages.push(this.redactPII(turn.content));
      } else if (turn.role === 'assistant') {
        botMessages.push(turn.content);

        // Try to extract intent from JSON bot responses
        try {
          const parsed = JSON.parse(turn.content);
          if (parsed.intent) intents.push(parsed.intent);
          if (Array.isArray(parsed.tool_calls)) {
            for (const tc of parsed.tool_calls) {
              if (tc.name && !toolsUsed.includes(tc.name)) {
                toolsUsed.push(tc.name);
              }
            }
          }
        } catch {
          // Bot message is plain text, not JSON — that's fine
        }
      }
    }

    // Determine primary intent (most frequent)
    const intentCounts = new Map<string, number>();
    for (const intent of intents) {
      intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    }
    const primaryIntent = Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

    // Infer satisfaction from last user messages
    const satisfaction = this.inferSatisfaction(userMessages);

    // Extract knowledge gaps from structured memory
    const knowledgeGaps: string[] = [];
    if (record.structuredMemory.customFields) {
      const gaps = record.structuredMemory.customFields['knowledge_gaps'];
      if (Array.isArray(gaps)) {
        knowledgeGaps.push(...gaps.map(String));
      }
    }

    // ───── VOC Aggregate Fields ─────
    let avgSentimentScore: number | undefined;
    let avgConfidenceScore: number | undefined;
    const detectedLangs = new Set<string>();
    let urgencyPeakLevel: string | undefined;
    const riskFlagsSet = new Set<string>();
    const entityTypesSet = new Set<string>();
    let customerStage: string | undefined;
    let fcrAchieved: boolean | undefined;

    if (vocRecords && vocRecords.length > 0) {
      // Aggregate sentiment
      const sentimentScores = vocRecords
        .filter((r) => r.sentiment && typeof r.sentiment.score === 'number')
        .map((r) => r.sentiment.score);
      if (sentimentScores.length > 0) {
        avgSentimentScore = Math.round(
          (sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length) * 100,
        ) / 100;
      }

      // Aggregate confidence (from response metadata on outbound records)
      const confidenceScores = vocRecords
        .filter((r) => r.responseMetadata?.confidenceScore !== undefined)
        .map((r) => r.responseMetadata!.confidenceScore);
      if (confidenceScores.length > 0) {
        avgConfidenceScore = Math.round(
          (confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length) * 100,
        ) / 100;
      }

      // Languages
      for (const rec of vocRecords) {
        for (const lang of rec.detectedLanguages) {
          detectedLangs.add(lang.code);
        }
      }

      // Peak urgency (critical > high > medium > low)
      const urgencyOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      let peakUrgencyValue = 0;
      for (const rec of vocRecords) {
        const val = urgencyOrder[rec.urgency.level] ?? 0;
        if (val > peakUrgencyValue) {
          peakUrgencyValue = val;
          urgencyPeakLevel = rec.urgency.level;
        }
      }

      // Risk flags
      for (const rec of vocRecords) {
        for (const flag of rec.riskFlags) {
          riskFlagsSet.add(flag.type);
        }
      }

      // Entity types
      for (const rec of vocRecords) {
        for (const entity of rec.entities) {
          entityTypesSet.add(entity.type);
        }
      }

      // Customer stage (last non-undefined)
      for (const rec of vocRecords) {
        if (rec.customerStage) customerStage = rec.customerStage;
      }

      // FCR: true if any VOC record says so
      fcrAchieved = vocRecords.some((r) => r.fcrAchieved === true);
    }

    const resolvedWithoutEscalation = record.state === 'RESOLVED';

    return {
      conversationId: record.conversationId,
      channel: 'web', // Default; could be enriched from inbound message
      tenantId,
      startedAt: record.createdAt,
      endedAt: record.updatedAt || Date.now(),
      turnCount: record.turnCount,
      finalState: record.state,
      intents,
      primaryIntent,
      toolsUsed,
      escalated: record.state === 'ESCALATED',
      escalationReason: record.structuredMemory.customFields?.['escalation_reason'] as string | undefined,
      clarificationCount: record.clarificationCount,
      knowledgeGaps,
      userMessages,
      botMessages,
      resolvedByBot: record.state === 'RESOLVED',
      satisfaction,
      // VOC aggregates
      avgSentimentScore,
      avgConfidenceScore,
      detectedLanguages: detectedLangs.size > 0 ? [...detectedLangs] : undefined,
      urgencyPeakLevel,
      riskFlagsDetected: riskFlagsSet.size > 0 ? [...riskFlagsSet] : undefined,
      entityTypes: entityTypesSet.size > 0 ? [...entityTypesSet] : undefined,
      customerStage,
      fcrAchieved,
      resolvedWithoutEscalation,
    };
  }

  /**
   * Infer customer satisfaction from the last few user messages.
   */
  private inferSatisfaction(userMessages: string[]): 'positive' | 'negative' | 'neutral' {
    // Check last 3 messages
    const recentMessages = userMessages.slice(-3).join(' ').toLowerCase();

    const hasPositive = POSITIVE_KEYWORDS.some((kw) => recentMessages.includes(kw));
    const hasNegative = NEGATIVE_KEYWORDS.some((kw) => recentMessages.includes(kw));

    if (hasPositive && !hasNegative) return 'positive';
    if (hasNegative) return 'negative';
    return 'neutral';
  }

  /**
   * Redact PII (phone numbers, emails) from text.
   */
  private redactPII(text: string): string {
    return text
      .replace(PHONE_REGEX, '[PHONE]')
      .replace(EMAIL_REGEX, '[EMAIL]');
  }
}
