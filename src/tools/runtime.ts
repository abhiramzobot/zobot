import Ajv from 'ajv';
import { toolRegistry } from './registry';
import { ToolContext, ToolResult, ToolCallLog, ToolDefinition, ToolFailureContext } from './types';
import { configService } from '../config/config-service';
import { logger } from '../observability/logger';
import { toolCallDuration, toolRetries, toolOutputValidationFailures, cacheHitsTotal, cacheMissesTotal } from '../observability/metrics';
import { redactObject } from '../observability/pii-redactor';
import { createHash } from 'crypto';
// ───── Enhancement v2: Caching, Dependency Health, Audit ─────
import { CacheStore } from '../cache/types';
import { getDependencyHealth } from '../resilience/dependency-health';
import { getAuditService } from '../audit/audit-service';
// ───── Enhancement v5: Feedback Collector ─────
import { FeedbackCollector } from '../copilot/feedback-collector';

const ajv = new Ajv({ allErrors: true, coerceTypes: true });

/** Per-tool rate limit tracking */
const toolRateCounters: Map<string, { count: number; resetAt: number }> = new Map();

const TOOL_TIMEOUT_MS = 15_000;

export class ToolRuntime {
  private cacheStore?: CacheStore;
  private feedbackCollector?: FeedbackCollector;

  /** Wire cache store for tool result caching (Enhancement v2) */
  setCacheStore(store: CacheStore): void {
    this.cacheStore = store;
  }

  /** Wire feedback collector for tool execution tracking (Enhancement v5) */
  setFeedbackCollector(collector: FeedbackCollector): void {
    this.feedbackCollector = collector;
  }

  /**
   * Execute a tool call with full governance:
   * - Schema validation
   * - Tenant + channel allowlist
   * - Feature flag check
   * - Rate limiting
   * - Timeout enforcement
   * - Single retry with backoff (Phase 9)
   * - Output schema validation (Phase 9)
   * - Tool result caching (Enhancement v2)
   * - Dependency health checks (Enhancement v2)
   * - Audit logging (Enhancement v2)
   * - Structured logging
   * - Safe error messages
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const log = logger.child({
      tool: toolName,
      requestId: ctx.requestId,
      conversationId: ctx.conversationId,
      tenantId: ctx.tenantId,
    });

    // 1. Check tool exists
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      log.warn('Tool not found in registry');
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // 2. Check tenant + channel allowlist
    if (!configService.isToolEnabled(ctx.tenantId, toolName, ctx.channel)) {
      log.warn({ channel: ctx.channel }, 'Tool not enabled for tenant/channel');
      return { success: false, error: `The "${toolName}" feature is not currently enabled. Please try a different approach or contact support for assistance.` };
    }

    // 3. Check channel allowed on tool definition
    if (!tool.allowedChannels.includes(ctx.channel)) {
      log.warn({ channel: ctx.channel, allowed: tool.allowedChannels }, 'Channel not in tool allowedChannels');
      return { success: false, error: 'Tool not supported on this channel' };
    }

    // 4. Rate limit check
    const rateKey = `${toolName}:${ctx.tenantId}`;
    const now = Date.now();
    let counter = toolRateCounters.get(rateKey);
    if (!counter || now >= counter.resetAt) {
      counter = { count: 0, resetAt: now + 60_000 };
      toolRateCounters.set(rateKey, counter);
    }
    counter.count++;
    if (counter.count > tool.rateLimitPerMinute) {
      log.warn({ count: counter.count, limit: tool.rateLimitPerMinute }, 'Tool rate limit exceeded');
      return { success: false, error: 'Tool rate limit exceeded. Try again shortly.' };
    }

    // 4b. Dependency health check (Enhancement v2)
    const depHealth = getDependencyHealth();
    if (depHealth) {
      // Map tool names to dependency names
      const toolDependencyMap: Record<string, string> = {
        lookup_order: 'oms', track_shipment: 'tracking', initiate_return: 'oms',
        cancel_order: 'oms', update_address: 'oms', change_payment_method: 'oms',
        generate_payment_link: 'payment', handoff_to_human: 'ticketing',
        search_knowledge: 'search',
      };
      const depName = toolDependencyMap[toolName];
      if (depName && !depHealth.isAvailable(depName as any)) {
        log.warn({ dependency: depName }, 'Dependency unavailable, tool blocked');
        return { success: false, error: `Service temporarily unavailable. Please try again shortly.` };
      }
    }

    // 4c. Tool result caching — check cache before execution (Enhancement v2)
    let cacheKey: string | undefined;
    if (this.cacheStore && tool.cacheable && tool.cacheTtlSeconds) {
      const argsHash = createHash('md5').update(JSON.stringify(args)).digest('hex').substring(0, 16);
      cacheKey = `tool:${toolName}:${argsHash}`;
      try {
        const cached = await this.cacheStore.get<ToolResult>(cacheKey);
        if (cached) {
          cacheHitsTotal.inc({ cache_type: `tool:${toolName}` });
          log.info({ cacheKey }, 'Tool cache hit');
          const durationMs = Date.now() - startTime;
          toolCallDuration.observe(
            { tool: toolName, version: tool.version, status: 'cache_hit' },
            durationMs / 1000,
          );
          return cached;
        }
        cacheMissesTotal.inc({ cache_type: `tool:${toolName}` });
      } catch {
        // Cache read failure — proceed normally
      }
    }

    // 5. Schema validation
    try {
      const validate = ajv.compile(tool.inputSchema);
      if (!validate(args)) {
        const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; ');
        log.warn({ errors }, 'Tool input schema validation failed');
        return { success: false, error: `Invalid input: ${errors}` };
      }
    } catch (err) {
      log.error({ err }, 'Schema compilation error');
      return { success: false, error: 'Internal validation error' };
    }

    // 6. Execute with timeout + retry
    let result = await this.tryExecute(tool, args, ctx, log);

    // 6b. Retry once if failed and tool is retryable
    if (!result.success && tool.retryable !== false) {
      const retryDelay = tool.retryDelayMs ?? 1000;
      log.info({ retryDelay }, 'Tool failed, retrying once');
      toolRetries.inc({ tool: toolName });
      await this.delay(retryDelay);
      result = await this.tryExecute(tool, args, ctx, log);
    }

    // 6c. Record dependency health (Enhancement v2)
    if (depHealth) {
      const toolDependencyMap: Record<string, string> = {
        lookup_order: 'oms', track_shipment: 'tracking', initiate_return: 'oms',
        cancel_order: 'oms', update_address: 'oms', change_payment_method: 'oms',
        generate_payment_link: 'payment', handoff_to_human: 'ticketing',
        search_knowledge: 'search',
      };
      const depName = toolDependencyMap[toolName];
      if (depName) {
        if (result.success) depHealth.recordSuccess(depName as any);
        else depHealth.recordFailure(depName as any, result.error ?? 'unknown');
      }
    }

    // 6d. Store in cache if cacheable and successful (Enhancement v2)
    if (this.cacheStore && cacheKey && result.success && tool.cacheTtlSeconds) {
      this.cacheStore.set(cacheKey, result, tool.cacheTtlSeconds).catch(() => {});
    }

    // 7. Output schema validation (if tool defines outputSchema and call succeeded)
    if (result.success && result.data && tool.outputSchema && Object.keys(tool.outputSchema).length > 0) {
      try {
        const outputValidate = ajv.compile(tool.outputSchema);
        if (!outputValidate(result.data)) {
          const errors = outputValidate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; ');
          log.warn({ errors }, 'Tool output schema validation failed');
          toolOutputValidationFailures.inc({ tool: toolName });
          // Don't fail the result — the data might still be usable
          // Just log the validation failure for monitoring
        }
      } catch {
        // Schema compilation error — don't fail the tool call
      }
    }

    // 8. Log and return
    const durationMs = Date.now() - startTime;
    toolCallDuration.observe(
      { tool: toolName, version: tool.version, status: result.success ? 'success' : 'error' },
      durationMs / 1000,
    );

    this.logToolCall(toolName, tool.version, args, result, durationMs, ctx);

    // Record tool execution in feedback collector (Enhancement v5)
    if (this.feedbackCollector) {
      this.feedbackCollector.collect({
        id: `tool_${ctx.requestId}_${toolName}`,
        conversationId: ctx.conversationId,
        agentId: 'system',
        resolutionAction: `tool:${toolName}`,
        wasOverride: false,
        knowledgeGaps: result.success ? [] : [`tool_failure:${toolName}`],
        suggestionQuality: result.success ? 5 : 1,
        timestamp: Date.now(),
      }).catch(() => {}); // fire-and-forget
    }

    return result;
  }

  /**
   * Build structured failure context for escalation.
   * Provides the LLM with enough context to give an honest, helpful response.
   */
  buildFailureContext(toolName: string, result: ToolResult, attempts: number): ToolFailureContext {
    const errorType = result.error?.includes('timeout') ? 'timeout'
      : result.error?.includes('validation') ? 'validation_error'
      : result.error?.includes('api') || result.error?.includes('API') ? 'api_error'
      : 'unknown';

    return {
      toolName,
      errorType,
      attempts,
      lastError: result.error ?? 'Unknown error',
      suggestion: errorType === 'timeout'
        ? 'The service is slow right now. Please try again in a moment.'
        : 'I was unable to retrieve this information. Let me connect you with a team member who can help.',
    };
  }

  /** Execute a single attempt with timeout */
  private async tryExecute(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    ctx: ToolContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void },
  ): Promise<ToolResult> {
    try {
      return await Promise.race([
        tool.handler(args, ctx),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), TOOL_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const safeError = errorMessage.includes('timeout')
        ? 'Tool execution timed out'
        : 'Tool execution failed';

      log.error({ err }, 'Tool execution attempt failed');
      return { success: false, error: safeError };
    }
  }

  /** Helper: async delay */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logToolCall(
    tool: string,
    version: string,
    args: Record<string, unknown>,
    result: ToolResult,
    durationMs: number,
    ctx: ToolContext,
  ): void {
    const logEntry: ToolCallLog = {
      tool,
      version,
      args: redactObject(args),
      result: {
        success: result.success,
        error: result.error,
        // Don't log full data payload to avoid PII in logs
        data: result.success ? '[redacted]' : undefined,
      },
      durationMs,
      timestamp: Date.now(),
      requestId: ctx.requestId,
      conversationId: ctx.conversationId,
      tenantId: ctx.tenantId,
    };

    logger.info({ toolCallLog: logEntry }, 'Tool call completed');

    // Audit log tool execution (Enhancement v2, fire-and-forget)
    try {
      const audit = getAuditService();
      if (audit) {
        audit.logEvent(
          'system',
          'tool_executed',
          'tool_execution',
          {
            tool,
            version,
            success: result.success,
            durationMs,
            error: result.error,
          },
          ctx.conversationId,
          ctx.tenantId,
        ).catch(() => {});
      }
    } catch { /* audit not initialized */ }
  }
}

export const toolRuntime = new ToolRuntime();
