import { Channel, ToolAuthLevel } from '../config/types';

/** Tool definition metadata */
export interface ToolDefinition {
  name: string;
  version: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
  outputSchema: Record<string, unknown>; // JSON Schema
  authLevel: ToolAuthLevel;
  rateLimitPerMinute: number;
  allowedChannels: Channel[];
  featureFlagKey: string;
  handler: ToolHandler;
  /** Whether this tool supports automatic retry on failure (default: true) */
  retryable?: boolean;
  /** Delay before retry in ms (default: 1000) */
  retryDelayMs?: number;
  /** Whether tool results can be cached (default: false) */
  cacheable?: boolean;
  /** Cache TTL in seconds (only used if cacheable=true) */
  cacheTtlSeconds?: number;
}

/** Structured context when a tool fails (for LLM escalation) */
export interface ToolFailureContext {
  toolName: string;
  errorType: 'timeout' | 'api_error' | 'validation_error' | 'unknown';
  attempts: number;
  lastError: string;
  suggestion: string;
}

/** Tool execution context */
export interface ToolContext {
  tenantId: string;
  channel: Channel;
  conversationId: string;
  visitorId: string;
  requestId: string;
}

/** Tool handler function */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

/** Tool execution result */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Tool call log record */
export interface ToolCallLog {
  tool: string;
  version: string;
  args: Record<string, unknown>;
  result: ToolResult;
  durationMs: number;
  timestamp: number;
  requestId: string;
  conversationId: string;
  tenantId: string;
}
