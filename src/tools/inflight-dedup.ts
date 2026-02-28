/**
 * In-Flight Request Deduplication
 *
 * When identical tool calls arrive concurrently (same tool + same args),
 * the second caller awaits the first caller's promise instead of making
 * a duplicate API call.
 */

import { ToolResult } from './types';

const inflightMap = new Map<string, Promise<ToolResult>>();

/**
 * Execute a tool call with in-flight deduplication.
 * If an identical call (same key) is already in progress, returns the same promise.
 */
export function deduplicatedExecute(
  key: string,
  execute: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const existing = inflightMap.get(key);
  if (existing) return existing;

  const promise = execute().finally(() => inflightMap.delete(key));
  inflightMap.set(key, promise);
  return promise;
}

/** Get count of in-flight requests (for metrics/debugging) */
export function getInflightCount(): number {
  return inflightMap.size;
}
