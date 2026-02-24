/**
 * Context Merger (Phase 2D)
 *
 * Copies structured memory, state, VOC records across channels.
 */

import { ConversationRecord, ConversationStore } from '../memory/types';
import { StructuredMemory } from '../config/types';
import { logger } from '../observability/logger';

const log = logger.child({ component: 'context-merger' });

export interface MergedContext {
  previousConversationId: string;
  mergedMemory: Partial<StructuredMemory>;
  previousState: string;
  previousIntent?: string;
  turnCount: number;
}

/**
 * Merge context from a previous conversation into the current one.
 * Preserves structured memory but starts fresh conversation turns.
 */
export async function mergeFromPrevious(
  store: ConversationStore,
  currentRecord: ConversationRecord,
  previousConversationId: string,
): Promise<MergedContext | null> {
  const previous = await store.get(previousConversationId);
  if (!previous) return null;

  log.info({
    current: currentRecord.conversationId,
    previous: previousConversationId,
    previousState: previous.state,
  }, 'Merging context from previous conversation');

  // Merge structured memory (current takes precedence)
  const merged: Partial<StructuredMemory> = {
    ...previous.structuredMemory,
    ...Object.fromEntries(
      Object.entries(currentRecord.structuredMemory).filter(([, v]) => v !== undefined && v !== ''),
    ),
    customFields: {
      ...previous.structuredMemory.customFields,
      ...currentRecord.structuredMemory.customFields,
    },
  };

  // Apply merged memory to current record
  currentRecord.structuredMemory = merged as StructuredMemory;

  // Add a system note about context continuation
  currentRecord.turns.push({
    role: 'system',
    content: `[Context continued from previous conversation ${previousConversationId}. Previous intent: ${previous.primaryIntent ?? 'unknown'}. Previous state: ${previous.state}. Turn count: ${previous.turnCount}]`,
    timestamp: Date.now(),
  });

  return {
    previousConversationId,
    mergedMemory: merged,
    previousState: previous.state,
    previousIntent: previous.primaryIntent,
    turnCount: previous.turnCount,
  };
}
