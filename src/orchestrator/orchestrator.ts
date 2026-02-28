import { InboundMessage, AgentResponse, ConversationTurn, StructuredMemory } from '../config/types';
import { ConversationRecord } from '../memory/types';
import { ConversationStore } from '../memory/types';
import { mergeStructuredMemory } from '../memory/conversation-memory';
import { stateMachine } from './state-machine';
import { AgentCore } from '../agent/agent-core';
import { toolRuntime } from '../tools/runtime';
import { ToolContext } from '../tools/types';
import { TicketingService } from '../ticketing/types';
import { ChannelOutbound } from '../channels/types';
import { ConversationCollector } from '../learning/conversation-collector';
import { configService } from '../config/config-service';
import { logger } from '../observability/logger';
import { TraceContext, startSpan, endSpan } from '../observability/trace';
import {
  activeConversations,
  escalations,
  vocSentimentDistribution,
  vocUrgencyDistribution,
  vocLanguageDistribution,
  vocIntentConfidence,
  vocRiskFlags,
  vocResolutionReceipts,
  crossChannelSwitchesTotal,
} from '../observability/metrics';
import { VOCPreProcessor, VOCStore, VOCRecord, VOCPreProcessResult } from '../voc';
import { ConfidenceRouter } from '../voc/confidence-router';
import { ProactiveChecker, ProactiveAlert } from '../voc/proactive-checker';
// ───── Enhancement v2 Imports ─────
import { getAuditService } from '../audit/audit-service';
import { SLAEngine } from '../sla/sla-engine';
import { SLAAlerter } from '../sla/sla-alerter';
import { CustomerLinker } from '../session/customer-linker';
import { mergeFromPrevious } from '../session/context-merger';
import { ProfileLoader } from '../customer360/profile-loader';
import { ExperimentEngine } from '../experiment/experiment-engine';
import { formatRichMedia } from '../channels/rich-media-formatter';
import { SkillRouter } from '../routing/skill-router';
import { getStaticFallback } from '../resilience/static-fallbacks';
import { getDependencyHealth } from '../resilience/dependency-health';
// ───── Order pre-fetch & fast-path ─────
import { getCacheStore } from '../cache/cache-service';
import { getOrderByNumber } from '../cache/order-index';
import { ToolResult } from '../tools/types';

/** Tools that support template-based fast-path responses (skip second LLM call) */
const FAST_PATH_TOOLS = new Set(['lookup_customer_orders', 'get_shipment_details', 'track_shipment', 'check_return_status', 'get_order_invoice']);

/** Tools that trigger progress messages */
const PROGRESS_MSG_TOOLS = new Set(['lookup_customer_orders', 'get_shipment_details', 'track_shipment']);

/** Terminal states where learning data should be collected */
const TERMINAL_STATES = new Set(['RESOLVED', 'ESCALATED']);

export class Orchestrator {
  private readonly confidenceRouter = new ConfidenceRouter();
  private readonly proactiveChecker?: ProactiveChecker;
  // ───── Enhancement v2 optional dependencies ─────
  private slaEngine?: SLAEngine;
  private slaAlerter?: SLAAlerter;
  private customerLinker?: CustomerLinker;
  private profileLoader?: ProfileLoader;
  private experimentEngine?: ExperimentEngine;
  private skillRouter?: SkillRouter;

  constructor(
    private readonly store: ConversationStore,
    private readonly ticketing: TicketingService,
    private readonly outbound: ChannelOutbound,
    private readonly agent: AgentCore,
    private readonly collector?: ConversationCollector,
    private readonly vocPreProcessor?: VOCPreProcessor,
    private readonly vocStore?: VOCStore,
    proactiveChecker?: ProactiveChecker,
  ) {
    this.proactiveChecker = proactiveChecker;
  }

  /** Wire Enhancement v2 dependencies (called from app.ts after construction) */
  setEnhancementV2(deps: {
    slaEngine?: SLAEngine;
    slaAlerter?: SLAAlerter;
    customerLinker?: CustomerLinker;
    profileLoader?: ProfileLoader;
    experimentEngine?: ExperimentEngine;
    skillRouter?: SkillRouter;
  }): void {
    this.slaEngine = deps.slaEngine;
    this.slaAlerter = deps.slaAlerter;
    this.customerLinker = deps.customerLinker;
    this.profileLoader = deps.profileLoader;
    this.experimentEngine = deps.experimentEngine;
    this.skillRouter = deps.skillRouter;
  }

  async handleMessage(inbound: InboundMessage, trace: TraceContext): Promise<void> {
    const log = logger.child({
      requestId: trace.requestId,
      conversationId: inbound.conversationId,
      channel: inbound.channel,
      tenantId: inbound.tenantId,
    });

    const spanOrch = startSpan(trace, 'orchestrator.handleMessage');

    try {
      // 1. Load or create conversation record (with omnichannel continuity)
      const spanLoad = startSpan(trace, 'conversation.load');
      let record = await this.store.get(inbound.conversationId);
      const isNew = !record;

      if (!record) {
        record = this.createNewRecord(inbound);
        activeConversations.inc({ channel: inbound.channel });
        log.info('New conversation started');

        // 1b. Omnichannel continuity: check for linked conversations
        if (this.customerLinker) {
          try {
            const phone = inbound.userProfile.phone;
            const email = inbound.userProfile.email;
            if (phone || email) {
              const customerId = await this.customerLinker.link(inbound.conversationId, phone, email);
              const linked = customerId ? await this.customerLinker.getLinkedConversations(customerId) : [];
              // Find most recent conversation from a different channel
              const previousConvId = linked.find((id) => id !== inbound.conversationId);
              if (previousConvId) {
                await mergeFromPrevious(this.store, record, previousConvId);
                record.linkedConversationIds = linked.filter((id) => id !== inbound.conversationId);
                record.customerId = customerId ?? undefined;
                record.sourceChannel = inbound.channel;
                crossChannelSwitchesTotal.inc();
                log.info({ customerId, previousConvId }, 'Omnichannel context merged');
              }
            }
          } catch (err) {
            log.warn({ err }, 'Omnichannel linking failed (non-blocking)');
          }
        }
      }
      endSpan(spanLoad);

      // 2. If NEW state, create ticket immediately
      if (isNew && record.state === 'NEW') {
        const spanTicket = startSpan(trace, 'ticket.create');
        try {
          const tenantConfig = configService.get(inbound.tenantId);
          if (tenantConfig.ticketCreationPolicy.autoCreateOnNew) {
            const ticket = await this.ticketing.createTicket({
              conversationId: inbound.conversationId,
              channel: inbound.channel,
              visitorId: inbound.visitorId,
              contactId: inbound.contactId,
              subject: `Chat - ${inbound.channel} - ${inbound.visitorId}`,
              description: inbound.message.text,
              tags: [`${tenantConfig.ticketCreationPolicy.tagPrefix}:${inbound.channel}`, `${tenantConfig.ticketCreationPolicy.tagPrefix}:new`],
              customFields: {
                visitorName: inbound.userProfile.name,
                visitorEmail: inbound.userProfile.email,
              },
            });
            record.ticketId = ticket.id;
            log.info({ ticketId: ticket.id }, 'Ticket created for new conversation');
          }
        } catch (err) {
          log.error({ err }, 'Failed to create ticket on NEW conversation');
        }
        endSpan(spanTicket);
      }

      // 2b. Assign SLA tier for new conversations
      if (isNew && this.slaEngine) {
        try {
          const tier = this.slaEngine.assignTier({});
          await this.slaEngine.createRecord(inbound.conversationId, tier);
          log.info({ tier }, 'SLA tier assigned');
        } catch (err) {
          log.warn({ err }, 'SLA assignment failed (non-blocking)');
        }
      }

      // 3. Add user turn to history
      record.turns.push({
        role: 'user',
        content: inbound.message.text,
        timestamp: inbound.timestamp,
      });
      record.turnCount++;

      // 4. Merge user profile into structured memory
      if (inbound.userProfile.name) record.structuredMemory.name = inbound.userProfile.name;
      if (inbound.userProfile.email) record.structuredMemory.email = inbound.userProfile.email;
      if (inbound.userProfile.phone) record.structuredMemory.phone = inbound.userProfile.phone;

      // 5. Send typing indicator (best-effort)
      this.outbound.sendTyping(inbound.conversationId, inbound.channel).catch(() => {});

      // 5b. VOC Pre-Processing (fast, sync, <10ms)
      let vocResult: VOCPreProcessResult | undefined;
      if (this.vocPreProcessor) {
        const spanVoc = startSpan(trace, 'voc.preprocess');
        vocResult = this.vocPreProcessor.process(inbound.message.text, {
          turnCount: record.turnCount,
          clarificationCount: record.clarificationCount,
          previousIntents: record.turns
            .filter((t) => t.role === 'assistant')
            .slice(-5)
            .map(() => record.primaryIntent ?? 'unknown'),
        });

        // Record VOC pre-processor metrics
        if (vocResult.detectedLanguages[0]) {
          vocLanguageDistribution.inc({ language: vocResult.detectedLanguages[0].code });
        }
        vocUrgencyDistribution.inc({ level: vocResult.urgency.level });
        for (const flag of vocResult.riskFlags) {
          vocRiskFlags.inc({ type: flag.type });
        }
        endSpan(spanVoc);
      }

      // 5c. Proactive context check (uses extracted entities + memory)
      let proactiveAlerts: ProactiveAlert[] = [];
      if (this.proactiveChecker && vocResult) {
        const spanProactive = startSpan(trace, 'proactive.check');
        const proactiveToolCtx: ToolContext = {
          tenantId: inbound.tenantId,
          channel: inbound.channel,
          conversationId: inbound.conversationId,
          visitorId: inbound.visitorId,
          requestId: trace.requestId,
        };
        proactiveAlerts = await this.proactiveChecker.check(
          vocResult.entities,
          record.structuredMemory,
          proactiveToolCtx,
        );
        endSpan(spanProactive);
      }

      // 5d. Load Customer 360 profile (Enhancement v2)
      let customerContext: string | undefined;
      if (this.profileLoader) {
        try {
          const customerId = inbound.userProfile.email || inbound.userProfile.phone || inbound.visitorId;
          const profile = await this.profileLoader.loadProfile(customerId);
          if (profile) {
            customerContext = this.profileLoader.formatForPrompt(profile);
          }
        } catch (err) {
          log.warn({ err }, 'Customer 360 profile load failed (non-blocking)');
        }
      }

      // 5e. Resolve A/B experiment overrides (Enhancement v2)
      let experimentPromptVersion: string | undefined;
      if (this.experimentEngine) {
        try {
          const assignment = this.experimentEngine.assign(inbound.conversationId);
          if (assignment) {
            const overrides = this.experimentEngine.getOverrides(inbound.conversationId);
            if (overrides?.promptVersion) {
              experimentPromptVersion = String(overrides.promptVersion);
            }
          }
        } catch (err) {
          log.warn({ err }, 'Experiment assignment failed (non-blocking)');
        }
      }

      // 5f. Pre-fetch: start order lookups in parallel with LLM call
      // VOC already extracted phone/order entities — start API calls now so data is ready
      // when the LLM returns tool calls
      const prefetchResults = new Map<string, Promise<ToolResult>>();
      if (vocResult) {
        const cacheStore = getCacheStore();
        const prefetchToolCtx: ToolContext = {
          tenantId: inbound.tenantId,
          channel: inbound.channel,
          conversationId: inbound.conversationId,
          visitorId: inbound.visitorId,
          requestId: trace.requestId,
        };

        for (const entity of vocResult.entities) {
          // Pre-fetch order by number from Redis index (fast, ~5ms)
          if (entity.type === 'order_number' && cacheStore) {
            const orderNo = entity.value.toUpperCase();
            prefetchResults.set(`order_no:${orderNo}`, getOrderByNumber(cacheStore, orderNo).then((cached) => {
              if (cached) {
                log.info({ orderNo, source: 'prefetch' }, 'Prefetch: order found in index');
                return {
                  success: true,
                  data: {
                    found: true,
                    phone: cached._sourcePhone ?? '',
                    customerName: cached.customerName ?? 'Unknown',
                    totalOrders: 1, totalPages: 1, currentPage: 1, orderCount: 1,
                    orders: [cached],
                    _fromCache: true,
                  },
                } as ToolResult;
              }
              return { success: false, error: 'not_in_cache' } as ToolResult;
            }).catch(() => ({ success: false, error: 'prefetch_failed' } as ToolResult)));
          }

          // Pre-fetch orders by phone (starts actual VineRetail API call)
          if (entity.type === 'phone' && entity.confidence >= 0.9) {
            const phone = entity.value;
            prefetchResults.set(`phone:${phone}`, toolRuntime.execute(
              'lookup_customer_orders',
              { phone },
              prefetchToolCtx,
            ).catch(() => ({ success: false, error: 'prefetch_failed' } as ToolResult)));
          }
        }
      }

      // 6. Call agent core (routed through ModelRouter with automatic failover)
      const spanAgent = startSpan(trace, 'agent.process');
      const tenantConfig = configService.get(inbound.tenantId);
      let agentResponse: AgentResponse;
      try {
        agentResponse = await this.agent.process(
          inbound.message.text,
          record.turns,
          record.structuredMemory,
          inbound.channel,
          experimentPromptVersion ?? tenantConfig.promptVersion,
          trace.requestId,
          proactiveAlerts.length > 0 ? this.proactiveChecker?.formatForPrompt(proactiveAlerts) : undefined,
          customerContext,
        );
      } catch (err) {
        // Graceful degradation: try static fallback (Enhancement v2)
        const depHealth = getDependencyHealth();
        if (depHealth) depHealth.recordFailure('llm', String(err));
        const primaryIntent = record.primaryIntent;
        const fallbackText = primaryIntent ? getStaticFallback(primaryIntent) : undefined;
        if (fallbackText) {
          log.warn({ err, intent: primaryIntent }, 'LLM failed, using static fallback');
          agentResponse = {
            userFacingMessage: fallbackText,
            intent: primaryIntent ?? 'fallback',
            shouldEscalate: false,
            toolCalls: [],
            extractedFields: {},
            ticketUpdatePayload: { summary: 'Static fallback response', tags: ['fallback'] },
          } as AgentResponse;
        } else {
          throw err; // re-throw if no fallback available
        }
      }
      endSpan(spanAgent);

      // 6b. Record LLM VOC metrics and build VOC record (async, fire-and-forget)
      if (agentResponse.sentiment) {
        vocSentimentDistribution.inc({
          label: agentResponse.sentiment.label,
          emotion: agentResponse.sentiment.emotion ?? 'unknown',
        });
      }
      if (typeof agentResponse.intentConfidence === 'number') {
        vocIntentConfidence.observe(agentResponse.intentConfidence);
      }
      if (agentResponse.resolutionReceipt) {
        vocResolutionReceipts.inc();
      }

      // Build and save VOC record (non-blocking)
      if (this.vocStore) {
        const vocRecord: VOCRecord = {
          messageId: `${inbound.conversationId}-${record.turnCount}`,
          conversationId: inbound.conversationId,
          timestamp: Date.now(),
          direction: 'inbound',
          originalText: inbound.message.text,
          detectedLanguages: vocResult?.detectedLanguages ?? [],
          intents: [
            { label: agentResponse.intent, confidence: agentResponse.intentConfidence ?? 0.5 },
            ...(agentResponse.secondaryIntents ?? []),
          ],
          entities: [
            ...(vocResult?.entities ?? []),
            ...(agentResponse.extractedEntities?.map((e) => ({
              type: e.type,
              value: e.value,
              rawText: e.value,
              confidence: e.confidence,
            })) ?? []),
          ],
          sentiment: agentResponse.sentiment
            ? { label: agentResponse.sentiment.label as 'positive' | 'negative' | 'neutral', score: agentResponse.sentiment.score, emotion: agentResponse.sentiment.emotion as any }
            : { label: 'neutral', score: 0 },
          urgency: vocResult?.urgency ?? { level: 'low', signals: [] },
          topics: agentResponse.ticketUpdatePayload.tags ?? [],
          customerStage: agentResponse.customerStage as any,
          riskFlags: vocResult?.riskFlags ?? [],
          fcrAchieved: agentResponse.fcrAchieved,
          resolutionReceipt: agentResponse.resolutionReceipt,
          knowledgeSources: [],
        };

        this.vocStore.save(vocRecord).catch((err) =>
          log.warn({ err }, 'VOC record save failed (non-blocking)'),
        );
      }

      // 6c. Confidence-based routing (Phase 5)
      const confidenceResult = this.confidenceRouter.evaluate(
        agentResponse,
        record.clarificationCount,
        vocResult?.detectedLanguages[0]?.code,
      );
      const routedResponse = this.confidenceRouter.apply(agentResponse, confidenceResult);
      // Use the routed response for all downstream steps
      Object.assign(agentResponse, routedResponse);

      // 7. Check escalation thresholds (10-trigger engine with VOC intelligence)
      const shouldEscalate = this.checkEscalationPolicy(agentResponse, record, tenantConfig, inbound, vocResult);

      // 8. Resolve and apply state transition
      const targetState = stateMachine.resolveTargetState(
        record.state,
        agentResponse.intent,
        shouldEscalate,
      );
      const { newState } = stateMachine.transition(
        inbound.conversationId,
        record.state,
        targetState,
        agentResponse.intent,
      );
      record.state = newState;

      // 9. Execute tool calls through the runtime (parallel where possible)
      const spanTools = startSpan(trace, 'tools.execute');
      const toolCtx: ToolContext = {
        tenantId: inbound.tenantId,
        channel: inbound.channel,
        conversationId: inbound.conversationId,
        visitorId: inbound.visitorId,
        requestId: trace.requestId,
      };

      // Send progress message for long-running lookups (fire-and-forget)
      if (agentResponse.toolCalls.some((tc) => PROGRESS_MSG_TOOLS.has(tc.name))) {
        this.outbound.sendMessage(
          inbound.conversationId,
          'Looking up your order details...',
          inbound.channel,
        ).catch(() => {});
      }

      // Execute all tool calls in parallel
      const toolPromises = agentResponse.toolCalls.map(async (toolCall) => {
        try {
          // Check if prefetch already has the result for this tool call
          let result: ToolResult | undefined;
          if (toolCall.name === 'lookup_customer_orders') {
            const orderNoArg = String(toolCall.args.order_no ?? '').toUpperCase();
            const phoneArg = String(toolCall.args.phone ?? '');
            if (orderNoArg && prefetchResults.has(`order_no:${orderNoArg}`)) {
              const prefetched = await prefetchResults.get(`order_no:${orderNoArg}`)!;
              if (prefetched.success) {
                log.info({ tool: toolCall.name, source: 'prefetch' }, 'Using prefetched result');
                result = prefetched;
              }
            }
            if (!result && phoneArg && prefetchResults.has(`phone:${phoneArg}`)) {
              const prefetched = await prefetchResults.get(`phone:${phoneArg}`)!;
              if (prefetched.success) {
                log.info({ tool: toolCall.name, source: 'prefetch' }, 'Using prefetched result');
                result = prefetched;
              }
            }
          }

          if (!result) {
            result = await toolRuntime.execute(toolCall.name, toolCall.args, toolCtx);
          }

          log.info({ tool: toolCall.name, success: result.success }, 'Tool executed');
          return { tool: toolCall.name, success: result.success, data: result.data, error: result.error, args: toolCall.args };
        } catch (err) {
          log.error({ err, tool: toolCall.name }, 'Tool execution error');
          return { tool: toolCall.name, success: false, error: String(err), args: toolCall.args };
        }
      });

      const toolResults = await Promise.all(toolPromises);

      // Post-process: handle handoff_to_human escalation
      for (const tr of toolResults) {
        if (tr.tool === 'handoff_to_human' && tr.success) {
          record.state = 'ESCALATED';
          const vocSummaryParts: string[] = [String((tr as any).args?.summary ?? '')];
          if (vocResult) {
            if (vocResult.urgency.level !== 'low') {
              vocSummaryParts.push(`Urgency: ${vocResult.urgency.level} (${vocResult.urgency.signals.join(', ')})`);
            }
            if (vocResult.riskFlags.length > 0) {
              vocSummaryParts.push(`Risk Flags: ${vocResult.riskFlags.map((f) => f.type).join(', ')}`);
            }
            if (vocResult.detectedLanguages[0]?.code !== 'en') {
              vocSummaryParts.push(`Language: ${vocResult.detectedLanguages[0]?.code}`);
            }
          }
          if (agentResponse.sentiment) {
            vocSummaryParts.push(`Sentiment: ${agentResponse.sentiment.label} (${agentResponse.sentiment.score})`);
          }
          if (agentResponse.customerStage) {
            vocSummaryParts.push(`Stage: ${agentResponse.customerStage}`);
          }
          vocSummaryParts.push(`Turns: ${record.turnCount}`);

          try {
            await this.outbound.escalateToHuman(
              inbound.conversationId,
              String((tr as any).args?.reason ?? 'Escalated'),
              vocSummaryParts.filter(Boolean).join(' | '),
              inbound.channel,
            );
          } catch (err) {
            log.error({ err }, 'Failed to escalate via outbound adapter');
          }
        }
      }
      endSpan(spanTools);

      // 9a. Populate structured memory with order data from tool results
      for (const tr of toolResults) {
        if (tr.tool === 'lookup_customer_orders' && tr.success && tr.data) {
          const data = tr.data as Record<string, unknown>;
          if (data.found && Array.isArray(data.orders)) {
            const orders = data.orders as Array<Record<string, unknown>>;
            const orderDataCache = record.structuredMemory.orderDataCache ?? {};
            const orderNumbers = new Set(record.structuredMemory.orderNumbers ?? []);

            for (const order of orders) {
              const oNo = String(order.orderNo ?? '');
              if (!oNo) continue;
              orderNumbers.add(oNo);

              const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
              orderDataCache[oNo] = {
                orderNo: oNo,
                status: String(order.status ?? 'Unknown'),
                orderDate: order.orderDate,
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                itemCount: items.length,
                itemSummary: items.map((i) => `${i.name} x${i.qty}`).join(', '),
                cachedAt: Date.now(),
              };
            }

            record.structuredMemory.orderNumbers = [...orderNumbers];
            record.structuredMemory.orderDataCache = orderDataCache;
            record.structuredMemory.lastOrderStatus = String(orders[0]?.status ?? '');
          }
        }
      }

      // 9b. TOOL RESULT FEEDBACK LOOP
      // Fast-path: if all tool results are for supported tools and all succeeded,
      // use template-based formatting and skip the second LLM call (~2-3s savings)
      const hasToolResults = toolResults.length > 0;
      const canUseFastPath = hasToolResults
        && toolResults.every((tr) => tr.success && FAST_PATH_TOOLS.has(tr.tool));

      if (canUseFastPath) {
        try {
          const fallback = (this.agent as any).buildToolResultsFallback?.(toolResults);
          if (fallback?.userFacingMessage) {
            log.info({ toolCount: toolResults.length }, 'Fast-path: using template response (skipping second LLM call)');
            agentResponse.userFacingMessage = fallback.userFacingMessage;
            if (fallback.intent) agentResponse.intent = fallback.intent;
          }
        } catch {
          // Fast-path failed — fall through to standard LLM refinement below
        }
      }

      if (hasToolResults && agentResponse.toolCalls.length > 0 && !canUseFastPath) {
        const spanRefine = startSpan(trace, 'agent.refineWithToolResults');
        try {
          log.info({ toolCount: toolResults.length }, 'Feeding tool results back to LLM');

          const refinedResponse = await this.agent.processWithToolResults(
            inbound.message.text,
            record.turns.slice(0, -1), // history WITHOUT the latest user turn (it's included separately)
            record.structuredMemory,
            inbound.channel,
            toolResults,
            agentResponse.userFacingMessage,
            experimentPromptVersion ?? tenantConfig.promptVersion,
            `${trace.requestId}-refined`,
          );

          // Update agent response with refined message
          agentResponse.userFacingMessage = refinedResponse.userFacingMessage;
          if (refinedResponse.intent) agentResponse.intent = refinedResponse.intent;
          agentResponse.extractedFields = {
            ...agentResponse.extractedFields,
            ...refinedResponse.extractedFields,
          };

          if (refinedResponse.shouldEscalate) {
            agentResponse.shouldEscalate = true;
            agentResponse.escalationReason = refinedResponse.escalationReason;
          }
        } catch (err) {
          log.error({ err }, 'Failed to refine response with tool results — using fallback');
          // Fallback: use raw tool data presentation
          try {
            const fallback = (this.agent as any).buildToolResultsFallback?.(toolResults);
            if (fallback?.userFacingMessage) {
              agentResponse.userFacingMessage = fallback.userFacingMessage;
            }
          } catch { /* keep original message if fallback also fails */ }
        }
        endSpan(spanRefine);
      }

      // 10. Merge extracted fields into structured memory
      record.structuredMemory = mergeStructuredMemory(
        record.structuredMemory,
        agentResponse.extractedFields,
      );

      // 11. Update ticket with latest info
      if (record.ticketId) {
        const spanTicketUpdate = startSpan(trace, 'ticket.update');
        try {
          const payload = agentResponse.ticketUpdatePayload;
          await this.ticketing.updateTicket({
            ticketId: record.ticketId,
            summary: payload.summary,
            status: shouldEscalate ? 'Escalated' : payload.status,
            tags: payload.tags,
            leadFields: payload.leadFields ?? agentResponse.extractedFields,
            intentClassification: payload.intentClassification ?? agentResponse.intent,
          });
        } catch (err) {
          log.error({ err }, 'Failed to update ticket');
        }
        endSpan(spanTicketUpdate);
      }

      // 12. Add assistant turn to history
      record.turns.push({
        role: 'assistant',
        content: agentResponse.userFacingMessage,
        timestamp: Date.now(),
      });

      // 13. Track clarification count
      if (agentResponse.intent === 'clarification' || agentResponse.intent === 'clarification_request') {
        record.clarificationCount++;
      }

      // 14. Save conversation record
      await this.store.save(record);

      // 14b. Collect for learning pipeline (fire-and-forget on terminal states)
      if (this.collector && TERMINAL_STATES.has(record.state)) {
        // Fetch VOC records for this conversation to enrich the summary
        const vocRecordsForSummary = this.vocStore
          ? await this.vocStore.getByConversation(inbound.conversationId).catch(() => undefined)
          : undefined;
        this.collector.collect(record, inbound.tenantId, vocRecordsForSummary).catch((err) =>
          log.warn({ err }, 'Learning collection failed (non-blocking)'),
        );
      }

      // 15. Send response to user (with rich media support)
      const spanSend = startSpan(trace, 'outbound.sendMessage');
      try {
        // 15a. Rich media: if agent returned richMediaPayload, try sendRichMessage first
        let richSent = false;
        if (agentResponse.richMediaPayload && this.outbound.sendRichMessage) {
          try {
            const formatted = formatRichMedia(inbound.channel, agentResponse.richMediaPayload as any);
            if (formatted.nativeSupported && formatted.channelPayload) {
              await this.outbound.sendRichMessage!(inbound.conversationId, formatted.channelPayload, inbound.channel);
              richSent = true;
            }
          } catch (err) {
            log.warn({ err }, 'Rich media send failed, falling back to text');
          }
        }
        // 15b. Send plain text (or fallback if rich media failed)
        if (!richSent) {
          await this.outbound.sendMessage(
            inbound.conversationId,
            agentResponse.userFacingMessage,
            inbound.channel,
          );
        }
      } catch (err) {
        log.error({ err }, 'Failed to send outbound message');
      }
      endSpan(spanSend);

      // 15c. SLA: record first response time (Enhancement v2)
      if (this.slaEngine && record.turnCount === 1) {
        this.slaEngine.recordFirstResponse(inbound.conversationId).catch((err) =>
          log.warn({ err }, 'SLA first response recording failed'),
        );
      }

      // 15d. SLA: check for breaches (Enhancement v2)
      if (this.slaEngine && this.slaAlerter) {
        this.slaEngine.checkBreach(inbound.conversationId).then((alerts) => {
          if (alerts.length > 0) this.slaAlerter!.emit(alerts);
        }).catch((err) => log.warn({ err }, 'SLA breach check failed'));
      }

      // 15e. Audit log: conversation turn (Enhancement v2, fire-and-forget)
      try {
        const audit = getAuditService();
        if (audit) {
          audit.logEvent(
            'system',
            'message_processed',
            'conversation',
            {
              intent: agentResponse.intent,
              state: record.state,
              turnCount: record.turnCount,
              channel: inbound.channel,
              toolCalls: agentResponse.toolCalls.map((tc) => tc.name),
            },
            inbound.conversationId,
            inbound.tenantId,
          ).catch(() => {});
        }
      } catch { /* audit not initialized */ }

      // 15f. Intelligent routing on escalation (Enhancement v2)
      if (shouldEscalate && this.skillRouter) {
        try {
          const detectedLang = vocResult?.detectedLanguages?.[0]?.code ?? 'en';
          const routingDecision = this.skillRouter.route(agentResponse.intent, detectedLang, 'skill_based');
          if (routingDecision?.agentId) {
            log.info({ agentId: routingDecision.agentId, reason: routingDecision.reason }, 'Routed to agent');
          }
        } catch (err) {
          log.warn({ err }, 'Skill routing failed (non-blocking)');
        }
      }

      endSpan(spanOrch);
      log.info({
        state: record.state,
        intent: agentResponse.intent,
        escalated: shouldEscalate,
        toolCalls: agentResponse.toolCalls.length,
        spanCount: trace.spans.length,
      }, 'Message processing complete');
    } catch (err) {
      endSpan(spanOrch, 'error');
      log.error({ err }, 'Orchestrator fatal error');
    }
  }

  private createNewRecord(inbound: InboundMessage): ConversationRecord {
    return {
      conversationId: inbound.conversationId,
      state: 'NEW',
      turns: [],
      structuredMemory: {
        name: inbound.userProfile.name,
        email: inbound.userProfile.email,
        phone: inbound.userProfile.phone,
        customFields: {},
      },
      ticketId: undefined,
      clarificationCount: 0,
      turnCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private checkEscalationPolicy(
    response: AgentResponse,
    record: ConversationRecord,
    tenantConfig: ReturnType<typeof configService.get>,
    inbound: InboundMessage,
    vocResult?: VOCPreProcessResult,
  ): boolean {
    const thresholds = tenantConfig.escalationThresholds;

    // 1. Explicit escalation from agent
    if (response.shouldEscalate) return true;

    // 2. Escalation intents
    if (thresholds.escalationIntents.includes(response.intent)) return true;

    // 3. VOC urgency critical → auto-escalate
    const urgencyAutoEscalate = thresholds.urgencyAutoEscalate ?? ['critical'];
    if (vocResult && urgencyAutoEscalate.includes(vocResult.urgency.level)) {
      escalations.inc({ reason: 'voc_urgency_critical', channel: inbound.channel });
      return true;
    }

    // 4-7. VOC risk flags → auto-escalate
    const riskFlagAutoEscalate = new Set(
      thresholds.riskFlagAutoEscalate ?? ['legal_threat', 'social_media_threat', 'policy_exception_requested', 'repeat_complaint'],
    );
    if (vocResult) {
      for (const flag of vocResult.riskFlags) {
        if (riskFlagAutoEscalate.has(flag.type)) {
          escalations.inc({ reason: `voc_risk_${flag.type}`, channel: inbound.channel });
          return true;
        }
      }
    }

    // 8. LLM sentiment score below threshold → escalate
    const sentimentThreshold = thresholds.sentimentEscalationThreshold ?? -0.7;
    if (response.sentiment && response.sentiment.score < sentimentThreshold) {
      escalations.inc({ reason: 'voc_sentiment_negative', channel: inbound.channel });
      return true;
    }

    // 9. Frustration keyword detection (existing fallback)
    const lowerMessage = inbound.message.text.toLowerCase();
    const hasFrustration = thresholds.frustrationKeywords.some(
      (kw) => lowerMessage.includes(kw.toLowerCase()),
    );
    if (hasFrustration) {
      escalations.inc({ reason: 'frustration_detected', channel: inbound.channel });
      return true;
    }

    // 10. Too many clarifications or max turns
    if (record.clarificationCount >= thresholds.maxClarifications) {
      escalations.inc({ reason: 'max_clarifications', channel: inbound.channel });
      return true;
    }

    const channelPolicy = tenantConfig.channelPolicies[inbound.channel];
    if (record.turnCount >= channelPolicy.maxTurnsBeforeEscalation) {
      escalations.inc({ reason: 'max_turns', channel: inbound.channel });
      return true;
    }

    return false;
  }
}
