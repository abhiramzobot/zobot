/**
 * Co-Pilot Service (Phase 2A)
 *
 * Generates draft responses, smart actions, knowledge assist.
 */

import { v4 as uuid } from 'uuid';
import { CoPilotSuggestion, AgentContextPanel, SmartAction, CoPilotConfig } from './types';
import { ConversationRecord } from '../memory/types';
import { AgentCore } from '../agent/agent-core';
import { knowledgeService } from '../knowledge/knowledge-service';
import { logger } from '../observability/logger';

const DEFAULT_CONFIG: CoPilotConfig = {
  enabled: false,
  mode: 'suggest',
  autoApproveThreshold: 0.9,
  maxSuggestions: 3,
};

export class CoPilotService {
  private readonly log = logger.child({ component: 'copilot' });
  private readonly pendingSuggestions = new Map<string, CoPilotSuggestion[]>();

  constructor(
    private readonly agent: AgentCore,
    private readonly config: CoPilotConfig = DEFAULT_CONFIG,
  ) {}

  /** Generate suggestions for an agent reviewing a conversation */
  async generateSuggestions(record: ConversationRecord): Promise<CoPilotSuggestion[]> {
    if (!this.config.enabled) return [];

    const suggestions: CoPilotSuggestion[] = [];

    try {
      // 1. Generate draft response via LLM
      const lastUserMsg = record.turns.filter((t) => t.role === 'user').pop();
      if (lastUserMsg) {
        const draftResponse = await this.agent.process(
          lastUserMsg.content,
          record.turns,
          record.structuredMemory,
          'web', // Co-pilot always uses web channel context
          undefined,
          `copilot-${record.conversationId}`,
        );

        suggestions.push({
          id: uuid(),
          type: 'draft_response',
          content: draftResponse.userFacingMessage,
          confidence: draftResponse.confidenceScore ?? 0.7,
          metadata: {
            intent: draftResponse.intent,
            toolCalls: draftResponse.toolCalls,
          },
          createdAt: Date.now(),
        });
      }

      // 2. Knowledge article suggestions
      const lastMsg = record.turns[record.turns.length - 1]?.content ?? '';
      const articles = knowledgeService.search(lastMsg, 3);
      for (const article of articles) {
        suggestions.push({
          id: uuid(),
          type: 'knowledge_article',
          content: article.content.substring(0, 500),
          confidence: article.score,
          metadata: { source: article.source, type: article.type },
          createdAt: Date.now(),
        });
      }

      // Store for later retrieval
      this.pendingSuggestions.set(record.conversationId, suggestions);
    } catch (err) {
      this.log.error({ err, conversationId: record.conversationId }, 'Co-pilot suggestion generation failed');
    }

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /** Build context panel for agent UI */
  async buildContextPanel(record: ConversationRecord): Promise<AgentContextPanel> {
    const suggestions = this.pendingSuggestions.get(record.conversationId) ?? [];
    const draftResponses = suggestions.filter((s) => s.type === 'draft_response');
    const knowledgeArticles = suggestions
      .filter((s) => s.type === 'knowledge_article')
      .map((s) => ({
        title: (s.metadata.title as string) ?? 'Knowledge Article',
        snippet: s.content,
        relevance: s.confidence,
      }));

    const smartActions = this.inferSmartActions(record);
    const qualityWarnings = this.checkQuality(record);

    return {
      conversationId: record.conversationId,
      visitorName: record.structuredMemory.name,
      channel: 'web',
      currentState: record.state,
      turnCount: record.turnCount,
      intent: record.primaryIntent ?? 'unknown',
      knowledgeArticles,
      suggestedActions: smartActions,
      draftResponses,
      qualityWarnings,
    };
  }

  /** Infer smart actions based on conversation state */
  private inferSmartActions(record: ConversationRecord): SmartAction[] {
    const actions: SmartAction[] = [];

    if (record.structuredMemory.orderNumbers?.length) {
      actions.push({
        id: uuid(),
        label: 'Look up order',
        description: `Check status of order ${record.structuredMemory.orderNumbers[0]}`,
        actionType: 'tool_call',
        payload: { tool: 'lookup_customer_orders', args: { orderNo: record.structuredMemory.orderNumbers[0] } },
      });
    }

    if (record.turnCount > 5) {
      actions.push({
        id: uuid(),
        label: 'Escalate to supervisor',
        description: 'Long conversation — consider supervisor escalation',
        actionType: 'escalate',
        payload: { reason: 'long_conversation', turns: record.turnCount },
      });
    }

    return actions;
  }

  /** Quality guardrails */
  private checkQuality(record: ConversationRecord): string[] {
    const warnings: string[] = [];

    if (record.clarificationCount >= 3) {
      warnings.push('Customer has asked for clarification 3+ times — ensure clear communication');
    }

    if (record.turnCount > 10) {
      warnings.push('Long conversation — consider whether resolution is progressing');
    }

    return warnings;
  }

  getSuggestions(conversationId: string): CoPilotSuggestion[] {
    return this.pendingSuggestions.get(conversationId) ?? [];
  }
}
