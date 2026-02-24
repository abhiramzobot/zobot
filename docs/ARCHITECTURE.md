# Zobot Enterprise Chatbot Platform -- Architecture Documentation

**Version:** 1.0.0
**Last Updated:** 2026-02-21
**Status:** Production

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [C4 Context Diagram](#2-c4-context-diagram)
3. [C4 Container Diagram](#3-c4-container-diagram)
4. [C4 Component Diagram](#4-c4-component-diagram)
5. [Sequence Diagram: Inbound Message Processing](#5-sequence-diagram-inbound-message-processing)
6. [Sequence Diagram: Escalation Flow](#6-sequence-diagram-escalation-flow)
7. [Data Flow Description](#7-data-flow-description)
8. [State Machine Diagram](#8-state-machine-diagram)
9. [Bounded Contexts](#9-bounded-contexts)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Deployment Topology](#11-deployment-topology)

---

## 1. System Overview

Zobot is an enterprise-grade AI chatbot platform built on **Node.js/TypeScript** with **Fastify** as the HTTP framework. It integrates with **Zoho SalesIQ** to serve customers across WhatsApp, Apple Business Chat, and website live chat channels. The platform uses **OpenAI gpt-5.2** for natural language understanding, intent classification, field extraction, and conversational response generation.

**Key Design Principles:**

- **Multi-tenant by default** -- tenant-scoped configuration, feature flags, and tool policies
- **Channel-agnostic core** -- a canonical `InboundMessage` type normalizes all channel differences
- **Deterministic state machine** -- finite-state conversation lifecycle with validated transitions
- **Governed tool execution** -- schema validation, rate limiting, feature flags, and channel allowlists
- **Graceful degradation** -- circuit breaker on LLM calls, in-memory fallback for Redis, mock services in dev
- **Observable from day one** -- structured logging (Pino), Prometheus metrics, distributed tracing

**Technology Stack:**

| Layer          | Technology                              |
|----------------|-----------------------------------------|
| Runtime        | Node.js >= 20, TypeScript 5.7           |
| HTTP Framework | Fastify 5                               |
| LLM Provider   | OpenAI gpt-5.2 (Chat Completions API)   |
| State Store    | Redis (ioredis) with in-memory fallback |
| Messaging      | Zoho SalesIQ REST API v2                |
| Ticketing      | Zoho SalesIQ / Zoho Desk REST API       |
| Metrics        | Prometheus (prom-client)                |
| Logging        | Pino (structured JSON)                  |
| Validation     | Ajv (JSON Schema)                       |
| Knowledge Base | YAML files (FAQ, Products, Policies)    |

---

## 2. C4 Context Diagram

The **Context diagram** shows Zobot and its relationships with external actors and systems.

```
+------------------------------------------------------------------+
|                        EXTERNAL ACTORS                           |
+------------------------------------------------------------------+

    +-------------+     +-------------------+     +--------------+
    |  Website    |     |  WhatsApp Users   |     | Apple Biz    |
    |  Visitors   |     |  (via Meta Cloud) |     | Chat Users   |
    +------+------+     +--------+----------+     +------+-------+
           |                     |                       |
           +---------------------+-----------------------+
                                 |
                      +----------v-----------+
                      |                      |
                      |   Zoho SalesIQ       |
                      |   (Chat Gateway)     |
                      |                      |
                      +----------+-----------+
                                 |
                    Webhook (POST /webhooks/salesiq)
                                 |
                      +----------v-----------+
                      |                      |
                      |   +--------------+   |
                      |   |              |   |
                      |   |    ZOBOT     |   |
                      |   |   Platform   |   |
                      |   |              |   |
                      |   +--------------+   |
                      |                      |
                      +--+-----+------+------+
                         |     |      |
             +-----------+     |      +-------------+
             |                 |                    |
    +--------v------+  +-------v--------+  +--------v--------+
    |               |  |                |  |                  |
    |  OpenAI API   |  |  Redis         |  |  Zoho Desk /    |
    |  (gpt-5.2)    |  |  (State Store) |  |  SalesIQ APIs   |
    |               |  |                |  |  (Ticketing)    |
    +---------------+  +----------------+  +------------------+
```

**Context Relationships:**

| Source/Target     | Relationship                                                       |
|-------------------|--------------------------------------------------------------------|
| Visitors          | Send messages via WhatsApp, Apple Business Chat, or website widget  |
| Zoho SalesIQ      | Routes visitor messages to Zobot via webhooks; receives replies     |
| Zobot Platform    | Processes conversations, classifies intents, executes tools         |
| OpenAI API        | Provides NLU, intent classification, field extraction, responses   |
| Redis             | Persists conversation state, turn history, structured memory       |
| Zoho Desk/SalesIQ | Creates and updates support tickets, manages escalation lifecycle  |

---

## 3. C4 Container Diagram

The **Container diagram** decomposes the Zobot platform into its deployable units and internal services.

```
+===============================================================================+
|                            ZOBOT PLATFORM                                     |
|                         (Node.js / Fastify)                                   |
|                                                                               |
|  +---------------------------+      +------------------------------+          |
|  | Fastify HTTP Server       |      | Admin API                    |          |
|  | (Port 3000)               |      | POST /admin/reload-config    |          |
|  |                           |      | GET  /admin/config/:tenantId |          |
|  | Endpoints:                |      | (API key auth)               |          |
|  |  POST /webhooks/salesiq   |      +------------------------------+          |
|  |  GET  /health             |                                                |
|  |  GET  /ready              |      +------------------------------+          |
|  |  GET  /metrics            |      | Security Layer               |          |
|  +-------------+-------------+      |  - Webhook HMAC-SHA256       |          |
|                |                    |  - Visitor rate limiter       |          |
|                |                    |  - Tenant rate limiter        |          |
|                v                    |  - Abuse detector             |          |
|  +---------------------------+      +------------------------------+          |
|  | Channel Adapter           |                                                |
|  | (SalesIQ Inbound/Outbound)|                                                |
|  +-------------+-------------+                                                |
|                |                                                              |
|                v                                                              |
|  +---------------------------+                                                |
|  | Conversation Orchestrator |---+                                            |
|  | (State Machine + Routing) |   |                                            |
|  +--+-----+-----+-----+-----+   |                                            |
|     |     |     |     |         |                                             |
|     v     v     v     v         v                                             |
|  +-----+ +---+ +---+ +------+ +-------+                                      |
|  |Agent| |Mem| |Tkt| |Tools | |Config  |                                     |
|  |Core | |ory| |ing| |Runtme| |Service |                                     |
|  +--+--+ +---+ +---+ +------+ +-------+                                      |
|     |                                                                         |
|     v                                                                         |
|  +---------------------------+                                                |
|  | Knowledge Layer           |                                                |
|  | (FAQ + Products + Policy) |                                                |
|  +---------------------------+                                                |
|                                                                               |
|  +---------------------------+                                                |
|  | Observability             |                                                |
|  | Logger | Metrics | Traces |                                                |
|  +---------------------------+                                                |
+===============================================================================+
         |                  |                    |
         v                  v                    v
  +-----------+      +-----------+       +---------------+
  | OpenAI    |      | Redis     |       | Zoho SalesIQ  |
  | API       |      |           |       | / Desk API    |
  +-----------+      +-----------+       +---------------+
```

**Container Responsibilities:**

| Container                  | Technology            | Purpose                                                          |
|----------------------------|-----------------------|------------------------------------------------------------------|
| Fastify HTTP Server        | Fastify 5             | Receives webhooks, serves health/metrics/admin endpoints         |
| Channel Adapter            | TypeScript            | Normalizes SalesIQ payloads; sends replies via SalesIQ REST API  |
| Conversation Orchestrator  | TypeScript            | Manages the 15-step message processing pipeline                  |
| Agent Core                 | OpenAI Node SDK       | Builds prompts, calls gpt-5.2, parses structured JSON responses |
| Tool Runtime               | TypeScript + Ajv      | Validates, rate-limits, and executes tool calls with timeouts    |
| Memory Service             | Redis / In-Memory     | Stores conversation records with 24h TTL, 20-turn sliding window|
| Ticketing Service          | Zoho REST API         | Creates/updates tickets, maps statuses between Zobot and Zoho    |
| Knowledge Layer            | YAML + keyword search | Provides FAQ, product, and policy context for LLM prompts       |
| Config Service             | JSON files            | Tenant config, channel policies, feature flags, prompt versions  |
| Observability Stack        | Pino + prom-client    | Structured logging, Prometheus metrics, span-based tracing       |
| Security Layer             | HMAC + rate limiters  | Webhook verification, visitor/tenant rate limiting, abuse detect |

---

## 4. C4 Component Diagram

The **Component diagram** shows the internal structure of the core system -- how classes and modules interact within the Fastify process.

```
+====================================================================================+
|                              ZOBOT PROCESS (src/)                                  |
|                                                                                    |
|  index.ts -----> app.ts (buildApp)                                                 |
|                    |                                                               |
|                    +-- Fastify Instance                                            |
|                    +-- Redis Connection (optional)                                 |
|                    +-- registerBuiltinTools()                                      |
|                    +-- createConversationStore(redis)                              |
|                    +-- createTicketingService()                                    |
|                    +-- SalesIQOutboundAdapter                                      |
|                    +-- Orchestrator(store, ticketing, outbound)                    |
|                    +-- registerSalesIQWebhook(app, orchestrator)                   |
|                    +-- registerHealthRoutes(app, redis)                            |
|                    +-- registerAdminRoutes(app)                                    |
|                                                                                    |
|  +------------------+     +-------------------+     +------------------+           |
|  | salesiq-webhook  |     | webhook-verifier  |     | rate-limiter     |           |
|  | .ts              +---->| .ts               |     | .ts              |           |
|  |                  |     | HMAC-SHA256 verify |     | visitor + tenant |           |
|  | POST /webhooks/  +---->|                   |     | sliding window   |           |
|  | salesiq          |     +-------------------+     +------------------+           |
|  |                  +---->+-------------------+                                    |
|  |                  |     | abuse-detector.ts |                                    |
|  +--------+---------+     | spam patterns,    |                                    |
|           |               | flood detection,  |                                    |
|           |               | blocklist         |                                    |
|           |               +-------------------+                                    |
|           |                                                                        |
|           | parseSalesIQWebhook(payload, tenantId) -> InboundMessage               |
|           |                                                                        |
|           v                                                                        |
|  +--------+---------+     +-------------------+     +------------------+           |
|  | Orchestrator      |     | StateMachine      |     | ConfigService    |           |
|  | .ts               +---->| .ts               |     | .ts              |           |
|  |                   |     |                   |     |                  |           |
|  | handleMessage()   |     | resolveTargetState|     | TenantConfig     |           |
|  |  1. Load/create   |     | transition()      |     | ChannelPolicies  |           |
|  |  2. Create ticket |     | STATE_TRANSITIONS |     | FeatureFlags     |           |
|  |  3. Add user turn |     +-------------------+     | EscalationRules  |           |
|  |  4. Merge profile |                               +------------------+           |
|  |  5. Send typing   |                                                             |
|  |  6. Call agent    +----->+------------------+                                    |
|  |  7. Check escal   |     | AgentCore        |     +------------------+           |
|  |  8. State transit  |     | .ts              |     | PromptManager    |           |
|  |  9. Execute tools +--+  |                  +---->| .ts              |           |
|  | 10. Merge memory  |  |  | OpenAI client    |     | Versioned bundles|           |
|  | 11. Update ticket |  |  | Circuit breaker  |     | system/dev/brand |           |
|  | 12. Add asst turn |  |  | buildMessages()  |     +------------------+           |
|  | 13. Track clarify |  |  | process()        |                                    |
|  | 14. Save record   |  |  | fallbackResponse |     +------------------+           |
|  | 15. Send response |  |  +--------+---------+     | ResponseContract |           |
|  +---+----------+----+  |           |               | .ts              |           |
|      |          |       |           v               | JSON Schema      |           |
|      v          v       |  +--------+---------+     | parseAgentResp() |           |
|  +---+---+  +---+---+  |  | KnowledgeService |     +------------------+           |
|  |Conver-|  |Ticket-|  |  | .ts              |                                    |
|  |sation |  |ing    |  |  |                  |                                    |
|  |Store  |  |Service|  |  | YAML files:      |                                    |
|  |       |  |       |  |  | faq.yaml         |                                    |
|  |Redis/ |  |SalesIQ|  |  | products.yaml    |                                    |
|  |Memory |  |/Mock  |  |  | policies.yaml    |                                    |
|  +-------+  +-------+  |  +------------------+                                    |
|                         |                                                          |
|                         v                                                          |
|                  +------+----------+                                               |
|                  | ToolRuntime     |     +------------------+                      |
|                  | .ts             +---->| ToolRegistry     |                      |
|                  |                 |     | .ts              |                      |
|                  | 1. Lookup tool  |     |                  |                      |
|                  | 2. Tenant check |     | Built-in tools:  |                      |
|                  | 3. Channel check|     | get_product_info |                      |
|                  | 4. Rate limit   |     | create_lead      |                      |
|                  | 5. Validate args|     | update_lead      |                      |
|                  | 6. Execute+tmot |     | create_ticket_   |                      |
|                  | 7. Log result   |     |   note           |                      |
|                  +------+----------+     | schedule_meeting |                      |
|                         |               | handoff_to_human |                      |
|                         v               +------------------+                      |
|                  +------+----------+                                               |
|                  | SalesIQOutbound |                                               |
|                  | Adapter         |                                               |
|                  |                 |                                               |
|                  | sendMessage()   |                                               |
|                  | sendTyping()    |                                               |
|                  | escalateToHuman |                                               |
|                  | addTags()       |                                               |
|                  | setDepartment() |                                               |
|                  +-----------------+                                               |
|                                                                                    |
|  +--------------------+  +-------------------+  +------------------+              |
|  | Logger (Pino)       |  | Metrics           |  | Trace            |              |
|  | pii-redactor.ts     |  | (prom-client)     |  | (span-based)     |              |
|  | Structured JSON     |  | 8 metric families |  | TraceContext      |              |
|  +--------------------+  +-------------------+  | startSpan/endSpan|              |
|                                                  +------------------+              |
+====================================================================================+
```

---

## 5. Sequence Diagram: Inbound Message Processing

This sequence shows the complete 15-step pipeline from webhook receipt through outbound response delivery.

```
Visitor       SalesIQ       Fastify         Security         Orchestrator
  |               |            |                |                  |
  |--message----->|            |                |                  |
  |               |--webhook-->|                |                  |
  |               |  POST      |                |                  |
  |               |  /webhooks |                |                  |
  |               |  /salesiq  |                |                  |
  |               |            |                |                  |
  |               |            |--verify sig--->|                  |
  |               |            |<--ok/reject----|                  |
  |               |            |                |                  |
  |               |            |--rate limit--->|                  |
  |               |            |  (visitor +    |                  |
  |               |            |   tenant)      |                  |
  |               |            |<--allowed------|                  |
  |               |            |                |                  |
  |               |            |--abuse check-->|                  |
  |               |            |<--ok-----------|                  |
  |               |            |                |                  |
  |               |            |  parseSalesIQWebhook()            |
  |               |            |  -> InboundMessage                |
  |               |            |                |                  |
  |               |            |--handleMessage(inbound, trace)--->|
  |               |<--200 accepted (async)------|                  |
  |               |            |                |                  |

                                                   Orchestrator
                                                       |
        ConvStore      StateMachine     AgentCore     ToolRuntime    Ticketing    Outbound
           |               |               |             |              |            |
           |               |               |             |              |            |
  Step 1:  Load/create conversation record  |             |              |            |
  ---------+               |               |             |              |            |
  <--------|               |               |             |              |            |
           |               |               |             |              |            |
  Step 2:  If NEW, create ticket            |             |              |            |
  ---------+-----------------------------------------------+----------->|            |
           |               |               |             |  createTicket|            |
           |               |               |             |  <-----------|            |
           |               |               |             |              |            |
  Step 3:  Add user turn to history         |             |              |            |
  Step 4:  Merge user profile into structured memory      |              |            |
           |               |               |             |              |            |
  Step 5:  Send typing indicator (fire-and-forget)        |              |            |
  ---------+-----------------------------------------------+---+---+--->|            |
           |               |               |             |   |   |  sendTyping()     |
           |               |               |             |   |   |   <--|            |
           |               |               |             |   |   |      |            |
  Step 6:  Call Agent Core |               |             |   |   |      |            |
  ---------+---------------+-------------->|             |   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |     | PromptManager    |    |   |   |      |            |
           |               |     | .get(version)    |    |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |     | KnowledgeService |    |   |   |      |            |
           |               |     | .buildContext()  |    |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |     | ToolRegistry     |    |   |   |      |            |
           |               |     | .getOpenAI...()  |    |   |   |      |            |
           |               |     +---------+--------+    |   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |               |--LLM call-->|   |   |      |            |
           |               |               |  OpenAI     |   |   |      |            |
           |               |               |  gpt-5.2    |   |   |      |            |
           |               |               |  (JSON mode)|   |   |      |            |
           |               |               |<-response---|   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |    parseAgentResponse(raw)  |   |   |      |            |
           |               |    -> AgentResponse         |   |   |      |            |
           |               |               |             |   |   |      |            |
  <--------+---------------+---------------|             |   |   |      |            |
           |               |               |             |   |   |      |            |
  Step 7:  Check escalation thresholds     |             |   |   |      |            |
           |  - Agent shouldEscalate flag  |             |   |   |      |            |
           |  - Escalation intents         |             |   |   |      |            |
           |  - Frustration keywords       |             |   |   |      |            |
           |  - Max clarifications (2)     |             |   |   |      |            |
           |  - Max turns per channel      |             |   |   |      |            |
           |               |               |             |   |   |      |            |
  Step 8:  State transition|               |             |   |   |      |            |
  ---------+-------------->|               |             |   |   |      |            |
           |  resolveTarget|               |             |   |   |      |            |
           |  State(       |               |             |   |   |      |            |
           |    current,   |               |             |   |   |      |            |
           |    intent,    |               |             |   |   |      |            |
           |    escalate)  |               |             |   |   |      |            |
           |               |               |             |   |   |      |            |
           |  transition(  |               |             |   |   |      |            |
           |    convId,    |               |             |   |   |      |            |
           |    current,   |               |             |   |   |      |            |
           |    target,    |               |             |   |   |      |            |
           |    intent)    |               |             |   |   |      |            |
           |<----newState--|               |             |   |   |      |            |
           |               |               |             |   |   |      |            |
  Step 9:  Execute tool calls              |             |   |   |      |            |
  ---------+---------------+---------------+------------>|   |   |      |            |
           |               |               |   for each  |   |   |      |            |
           |               |               |   toolCall: |   |   |      |            |
           |               |               |   execute(  |   |   |      |            |
           |               |               |     name,   |   |   |      |            |
           |               |               |     args,   |   |   |      |            |
           |               |               |     ctx)    |   |   |      |            |
           |               |               |             |   |   |      |            |
           |               |               |   If handoff_to_human:     |            |
           |               |               |   -> state = ESCALATED     |            |
  ---------+---------------+---------------+-------------+---+---+---->|            |
           |               |               |             |   |   | escalateToHuman()|
           |               |               |             |   |   |  <---|            |
           |               |               |             |   |   |      |            |
  Step 10: Merge extracted fields into structured memory  |   |   |      |            |
  Step 11: Update ticket   |               |             |   |   |      |            |
  ---------+---------------+---------------+-------------+---+-->|      |            |
           |               |               |             |   updateTicket()          |
           |               |               |             |    <--|      |            |
           |               |               |             |       |      |            |
  Step 12: Add assistant turn to history   |             |       |      |            |
  Step 13: Track clarification count       |             |       |      |            |
           |               |               |             |       |      |            |
  Step 14: Save conversation record        |             |       |      |            |
  -------->|               |               |             |       |      |            |
           | Redis SET     |               |             |       |      |            |
           | w/ 24h TTL    |               |             |       |      |            |
           |               |               |             |       |      |            |
  Step 15: Send response   |               |             |       |      |            |
  ---------+---------------+---------------+-------------+-------+----->|            |
           |               |               |             |       |  sendMessage()    |
           |               |               |             |       |      |            |
           |               |               |             |       |      |--reply---->
           |               |               |             |       |      |   SalesIQ
           |               |               |             |       |      |     |
           |               |               |             |       |      |     +--->
           |               |               |             |       |      |     Visitor
```

**Step-by-Step Pipeline Detail:**

| Step | Operation                        | Component              | Notes                                           |
|------|----------------------------------|------------------------|-------------------------------------------------|
| 0a   | Webhook signature verification   | WebhookVerifier        | HMAC-SHA256; skipped in dev if no secret         |
| 0b   | Rate limiting (visitor + tenant) | RateLimiter            | Sliding-window; 30/min visitor, 300/min tenant   |
| 0c   | Abuse detection                  | AbuseDetector          | Spam patterns, duplicate flood, blocklist        |
| 0d   | Payload parsing                  | SalesIQAdapter         | Maps raw webhook to canonical InboundMessage     |
| 0e   | Return 200 immediately           | SalesIQWebhook         | Async processing to avoid webhook timeouts       |
| 1    | Load/create conversation record  | ConversationStore      | Redis GET or create new record with state=NEW    |
| 2    | Create ticket (if NEW)           | TicketingService       | Governed by autoCreateOnNew tenant policy        |
| 3    | Append user turn                 | Orchestrator           | Push to turns array, increment turnCount         |
| 4    | Merge user profile               | Orchestrator           | Name, email, phone from inbound.userProfile      |
| 5    | Send typing indicator            | SalesIQOutboundAdapter | Fire-and-forget; errors swallowed                |
| 6    | Call Agent Core (LLM)            | AgentCore              | Builds prompt, calls gpt-5.2 with JSON mode      |
| 7    | Check escalation thresholds      | Orchestrator           | 5 escalation criteria evaluated in order         |
| 8    | Resolve and apply state transition| StateMachine          | Intent-based target resolution + validated step  |
| 9    | Execute tool calls               | ToolRuntime            | Schema validation, rate limit, 15s timeout       |
| 10   | Merge extracted fields           | mergeStructuredMemory  | Accumulates name, email, company, products, etc. |
| 11   | Update ticket                    | TicketingService       | Summary, tags, status, lead fields, intent       |
| 12   | Append assistant turn            | Orchestrator           | Push agent response to conversation history      |
| 13   | Track clarification count        | Orchestrator           | Incremented on clarification intents             |
| 14   | Save conversation record         | ConversationStore      | Redis SET with 24h TTL, 20-turn sliding window   |
| 15   | Send outbound response           | SalesIQOutboundAdapter | POST to SalesIQ chat messages API                |

---

## 6. Sequence Diagram: Escalation Flow

This diagram shows the five paths through which a conversation escalates to a human agent.

```
                    Orchestrator
                         |
                         v
          +------------------------------+
          |  checkEscalationPolicy()     |
          |  Evaluates 5 criteria:       |
          +-----+-----+-----+-----+-----+
                |     |     |     |     |
                v     v     v     v     v

          +-------+ +-------+ +--------+ +--------+ +--------+
          |Agent  | |Escal. | |Frustr. | |Max     | |Max     |
          |Flag   | |Intent | |Keyword | |Clarif. | |Turns   |
          |       | |       | |        | |        | |        |
          |should | |request| |"angry" | |count   | |per     |
          |Escal. | |_human | |"worst" | |>= 2    | |channel |
          |= true | |compl. | |"speak  | |        | |(def 10)|
          |       | |legal  | | to     | |        | |        |
          |       | |contrt.| | human" | |        | |        |
          |       | |discnt.| |"mngr"  | |        | |        |
          +---+---+ +---+---+ +---+----+ +---+----+ +---+----+
              |          |         |          |          |
              +----------+---------+----------+----------+
                                   |
                          (any true = escalate)
                                   |
                                   v
                    +------------------------------+
                    | shouldEscalate = true        |
                    +------------------------------+
                                   |
               +-------------------+-------------------+
               |                                       |
               v                                       v
    +---------------------+             +-----------------------------+
    | StateMachine        |             | Metrics                     |
    | resolveTargetState  |             | escalations.inc({           |
    |  -> returns         |             |   reason: <trigger>,        |
    |     'ESCALATED'     |             |   channel                   |
    +----------+----------+             | })                          |
               |                        +-----------------------------+
               v
    +---------------------+
    | StateMachine        |
    | transition(         |
    |   current,          |
    |   'ESCALATED',      |
    |   intent)           |
    | -> newState =       |
    |    'ESCALATED'      |
    +----------+----------+
               |
               v
    +---------------------+          +-------------------------+
    | ToolRuntime         |          | Ticketing Service       |
    | execute(            |          | updateTicket({          |
    |  'handoff_to_human',|          |   ticketId,             |
    |  { reason, summary }|          |   status: 'Escalated', |
    |  ctx)               |          |   tags,                 |
    +----------+----------+          |   leadFields,           |
               |                     |   intentClassification  |
               v                     | })                      |
    +---------------------+          +------------+------------+
    | SalesIQ Outbound    |                        |
    | escalateToHuman(    |                        v
    |   conversationId,   |          +-------------------------+
    |   reason,           |          | Zoho Desk / SalesIQ     |
    |   summary,          |          | Ticket status ->        |
    |   channel           |          |   "Escalated"           |
    | )                   |          | Tags updated            |
    +----------+----------+          | Lead fields persisted   |
               |                     +-------------------------+
               v
    +---------------------+
    | SalesIQ REST API    |
    | POST /chats/{id}/   |
    |   escalate          |
    | {reason, summary}   |
    +----------+----------+
               |
               v
    +---------------------+
    | SalesIQ routes chat |
    | to human agent queue|
    | with full context:  |
    |  - Conversation     |
    |    history           |
    |  - Structured memory|
    |  - Escalation reason|
    |  - AI summary       |
    +---------------------+

    Meanwhile:
    +---------------------+
    | Orchestrator sends  |
    | final AI message to |
    | visitor:            |
    | "Let me connect you |
    |  with a team member"|
    +---------------------+
```

**Escalation Trigger Criteria (evaluated in order):**

| Priority | Trigger                  | Source               | Threshold / Values                                           |
|----------|--------------------------|----------------------|--------------------------------------------------------------|
| 1        | Agent explicit flag      | AgentResponse        | `shouldEscalate: true` in LLM JSON output                   |
| 2        | Escalation intents       | TenantConfig         | `request_human`, `complaint`, `legal_question`, `contract_negotiation`, `discount_request` |
| 3        | Frustration keywords     | TenantConfig         | `frustrated`, `angry`, `useless`, `terrible`, `worst`, `speak to human`, `real person`, `manager`, `supervisor` |
| 4        | Max clarifications       | TenantConfig         | Default: 2 consecutive clarification intents                 |
| 5        | Max turns per channel    | ChannelPolicy        | Default: 10 turns before forced escalation                   |

**Circuit Breaker (LLM Failure Path):**

When the OpenAI API fails, the AgentCore circuit breaker activates after 5 consecutive failures. While the circuit is open (60s window), all requests receive a fallback response that automatically triggers escalation via `handoff_to_human`. This ensures visitors are never stranded during an LLM outage.

---

## 7. Data Flow Description

### 7.1 Inbound Data Flow

```
SalesIQ Webhook Payload (raw JSON)
         |
         v
+-------------------+
| parseSalesIQWebhook|     Channel mapping:
| ()                |       "whatsapp"      -> 'whatsapp'
|                   |       "business_chat" -> 'business_chat'
| Extracts:         |       default         -> 'web'
|  - chat.id        |
|  - visitor.id     |
|  - message.text   |
|  - visitor.name   |
|  - visitor.email  |
|  - visitor.phone  |
|  - chat.channel   |
+--------+----------+
         |
         v
+-------------------+      +--------------------------------------+
| InboundMessage    |      | Fields:                              |
| (Canonical Type)  |      |  channel: Channel                    |
|                   |      |  conversationId: string               |
|                   |      |  visitorId: string                    |
|                   |      |  contactId?: string                   |
|                   |      |  userProfile: { name, phone, email,  |
|                   |      |    locale, timezone, attributes }     |
|                   |      |  message: { text, attachments[] }     |
|                   |      |  timestamp: number                    |
|                   |      |  tenantId: string                     |
|                   |      +--------------------------------------+
+--------+----------+
         |
         v
+-------------------+
| Orchestrator      |
| handleMessage()   |
+-------------------+
```

### 7.2 Conversation State Record

```
ConversationRecord (Redis / In-Memory)
+----------------------------------------------------------+
| conversationId : string                                  |
| state          : ConversationState (FSM state)           |
| turns[]        : ConversationTurn[] (max 20, sliding)    |
|   +-- role     : 'user' | 'assistant' | 'system'        |
|   +-- content  : string                                  |
|   +-- timestamp: number                                  |
| structuredMemory : StructuredMemory                      |
|   +-- name           : string?                           |
|   +-- email          : string?                           |
|   +-- phone          : string?                           |
|   +-- company        : string?                           |
|   +-- intent         : string?                           |
|   +-- productInterest: string[]?                         |
|   +-- customFields   : Record<string, unknown>           |
| ticketId        : string? (Zoho Desk ticket ID)          |
| clarificationCount : number                              |
| turnCount       : number                                 |
| createdAt       : number (epoch ms)                      |
| updatedAt       : number (epoch ms)                      |
+----------------------------------------------------------+

Redis key format:  zobot:conv:{conversationId}
TTL:               24 hours
Turn trimming:     System turns preserved; last 20 non-system turns kept
```

### 7.3 LLM Request/Response Data Flow

```
AgentCore.process()
         |
         v
+---------------------+
| buildMessages()     |
|                     |
| Assembles:          |        +-----------------------------------+
|  1. System prompt   |<-------|  PromptManager.get(version)       |
|     - system.md     |        |  Returns: { system, developer,   |
|     - developer.md  |        |             brandTone }           |
|     - brand_tone.md |        +-----------------------------------+
|                     |
|  2. Response schema |<-------  RESPONSE_CONTRACT_SCHEMA (JSON Schema)
|                     |
|  3. Context block   |<-------  channel, structuredMemory
|                     |
|  4. Knowledge base  |<-------|  KnowledgeService.buildContext()  |
|     context         |        |  keyword search across:           |
|                     |        |   faq.yaml, products.yaml,        |
|                     |        |   policies.yaml                   |
|                     |        |  Returns top-5 scored results     |
|                     |        +-----------------------------------+
|  5. Available tools |<-------  ToolRegistry.getAll() descriptions
|                     |
|  6. Conversation    |<-------  Last N turns from history
|     history         |
|                     |
|  7. Current user    |<-------  inbound.message.text
|     message         |
+----------+----------+
           |
           v
+---------------------+     +------------------------------+
| OpenAI API Call     |     | Parameters:                  |
|                     |     |  model: gpt-5.2              |
| POST /chat/        |     |  temperature: 0.3            |
|   completions       |     |  max_tokens: 2048            |
|                     |     |  response_format: json_object|
+----------+----------+     |  tools: [...] (if any)       |
           |                +------------------------------+
           v
+---------------------+
| parseAgentResponse()|
|                     |
| Extracts:           |
+----------+----------+
           |
           v
+---------------------+     +--------------------------------------+
| AgentResponse       |     | Fields:                              |
| (Canonical Type)    |     |  userFacingMessage: string            |
|                     |     |  intent: string                       |
|                     |     |  extractedFields: Record<str, unk>    |
|                     |     |  shouldEscalate: boolean              |
|                     |     |  escalationReason?: string            |
|                     |     |  ticketUpdatePayload: {               |
|                     |     |    summary?, tags?, status?,          |
|                     |     |    leadFields?, intentClassification? |
|                     |     |  }                                    |
|                     |     |  toolCalls: [{ name, args }]          |
|                     |     +--------------------------------------+
+---------------------+
```

### 7.4 Tool Execution Data Flow

```
AgentResponse.toolCalls[]
         |
         | for each { name, args }
         v
+---------------------+
| ToolRuntime.execute()|
|                     |
| Governance chain:   |
|  1. Registry lookup |----> ToolRegistry.get(name) -> ToolDefinition?
|  2. Tenant enabled? |----> ConfigService.isToolEnabled(tenant, tool, channel)
|  3. Channel allowed?|----> tool.allowedChannels.includes(channel)
|  4. Rate limit OK?  |----> Per-tool: tool.rateLimitPerMinute
|  5. Schema valid?   |----> Ajv.compile(tool.inputSchema).validate(args)
|  6. Execute handler |----> tool.handler(args, ctx) with 15s timeout
|  7. Log + metrics   |----> PII-redacted ToolCallLog record
+----------+----------+
           |
           v
+---------------------+
| ToolResult          |
| { success, data?,   |
|   error? }          |
+---------------------+
```

### 7.5 Outbound Data Flow

```
Orchestrator
     |
     |  agentResponse.userFacingMessage
     v
+---------------------+
| SalesIQOutbound     |
| Adapter             |
|                     |
| sendMessage(        |     POST /api/v2/{appId}/chats/{chatId}/messages
|   conversationId,   |---->  { message: { text },
|   text,             |        sender: { screen_name, type: 'bot' } }
|   channel           |
| )                   |
+---------------------+
     |
     v
SalesIQ delivers to visitor's channel (WhatsApp / Business Chat / Web Widget)
```

---

## 8. State Machine Diagram

### 8.1 States

| State               | Description                                                   |
|---------------------|---------------------------------------------------------------|
| `NEW`               | Conversation just started; no turns processed yet             |
| `ACTIVE_QA`         | General Q&A; FAQ, greetings, general questions                |
| `LEAD_QUALIFICATION`| Visitor expressing product/pricing interest; collecting fields |
| `MEETING_BOOKING`   | Visitor wants to schedule a demo or meeting                   |
| `SUPPORT_TRIAGE`    | Visitor reports a bug, technical issue, or support request     |
| `ESCALATED`         | Conversation handed off to a human agent                      |
| `RESOLVED`          | Conversation completed (can reopen to ACTIVE_QA)              |

### 8.2 Transition Diagram

```
                              +-------------------------------------------+
                              |                                           |
                              |  (reopen)                                 |
                              v                                           |
                         +---------+                                      |
             +---------->| ACTIVE  |<-----------+-----------+             |
             |           |   QA    |            |           |             |
             |           +----+----+            |           |             |
             |                |                 |           |             |
             |    +-----------+-----------+     |           |             |
             |    |           |           |     |           |             |
             |    v           v           v     |           |             |
    +-----+  | +--+-----+ +--+------+ +--+-----++          |             |
    | NEW +--+ | LEAD   | | MEETING | | SUPPORT |          |             |
    |     +--+ | QUALIF.| | BOOKING | | TRIAGE  |          |             |
    +--+--+  | +--+-----+ +---+-----+ +---+-----+          |             |
       |     |    |   ^        |           |                |             |
       |     |    |   |        |           |                |             |
       |     |    +---+        |           |                |             |
       |     |  (LEAD_QUAL <-> |           |                |             |
       |     |   MEETING_BOOK) |           |                |             |
       |     |    |            |           |                |             |
       |     |    +------+-----+-----------+-----+----------+             |
       |     |           |                       |                        |
       |     |           v                       v                        |
       |     |     +-----+-----+          +------+-----+                  |
       |     +---->| ESCALATED |          |  RESOLVED  +------------------+
       +---------->|           |--------->|            |
                   +-----------+          +------------+
```

### 8.3 Transition Table

The complete set of valid state transitions, as defined in `STATE_TRANSITIONS`:

| From State          | Allowed Target States                                            |
|---------------------|------------------------------------------------------------------|
| `NEW`               | `ACTIVE_QA`, `LEAD_QUALIFICATION`, `SUPPORT_TRIAGE`, `ESCALATED` |
| `ACTIVE_QA`         | `LEAD_QUALIFICATION`, `MEETING_BOOKING`, `SUPPORT_TRIAGE`, `ESCALATED`, `RESOLVED` |
| `LEAD_QUALIFICATION`| `ACTIVE_QA`, `MEETING_BOOKING`, `SUPPORT_TRIAGE`, `ESCALATED`, `RESOLVED` |
| `MEETING_BOOKING`   | `ACTIVE_QA`, `LEAD_QUALIFICATION`, `ESCALATED`, `RESOLVED`      |
| `SUPPORT_TRIAGE`    | `ACTIVE_QA`, `ESCALATED`, `RESOLVED`                             |
| `ESCALATED`         | `RESOLVED`                                                       |
| `RESOLVED`          | `ACTIVE_QA` (reopen only)                                        |

### 8.4 Intent-to-State Mapping

The `StateMachine.resolveTargetState()` method maps classified intents to target states:

| Intent(s)                                           | Target State          | Notes                              |
|-----------------------------------------------------|-----------------------|------------------------------------|
| `greeting`, `general_question`, `faq`               | `ACTIVE_QA`           | Only if current state is `NEW`     |
| `lead_inquiry`, `pricing_question`, `product_interest`| `LEAD_QUALIFICATION`| Always transitions                 |
| `schedule_meeting`, `book_demo`                     | `MEETING_BOOKING`     | Always transitions                 |
| `support_request`, `bug_report`, `technical_issue`  | `SUPPORT_TRIAGE`      | Always transitions                 |
| `resolved`, `goodbye`, `thank_you`                  | `RESOLVED`            | Always transitions                 |
| `request_human`, `complaint`, `legal_question`, `contract_negotiation`, `discount_request` | `ESCALATED` | Always escalates |
| `shouldEscalate = true`                             | `ESCALATED`           | Overrides intent mapping           |
| (any other / unknown)                               | `ACTIVE_QA`           | Only if current state is `NEW`; otherwise stays |

### 8.5 Transition Validation

Invalid transitions are **rejected silently** -- the conversation remains in its current state. A warning log is emitted with the attempted source, target, and reason. The `stateTransitions` Prometheus counter tracks all successful transitions by `{from, to}` labels.

---

## 9. Bounded Contexts

### 9.1 Channel Adapters (`src/channels/`)

**Responsibility:** Normalize inbound messages from Zoho SalesIQ and dispatch outbound messages back through SalesIQ REST API.

| File                 | Role                                                              |
|----------------------|-------------------------------------------------------------------|
| `types.ts`           | `SalesIQWebhookPayload`, `ChannelOutbound` interface, `WebhookParseResult` |
| `salesiq-adapter.ts` | `parseSalesIQWebhook()` -- inbound normalization; `SalesIQOutboundAdapter` -- outbound API calls |
| `salesiq-webhook.ts` | Fastify route handler for `POST /webhooks/salesiq`; orchestrates security checks |

**Key Design Decisions:**
- The webhook handler returns `200 Accepted` immediately and processes asynchronously to prevent SalesIQ webhook timeouts.
- Channel mapping is centralized in `mapChannel()`: `"whatsapp"`, `"business_chat"`/`"apple"`, or default `"web"`.
- The `ChannelOutbound` interface abstracts all outbound operations (`sendMessage`, `sendTyping`, `escalateToHuman`, `addTags`, `setDepartment`) making it possible to swap in alternative channel adapters.

### 9.2 Conversation Orchestrator (`src/orchestrator/`)

**Responsibility:** Central coordinator that implements the 15-step message processing pipeline. Manages conversation lifecycle, state transitions, and coordination between all other bounded contexts.

| File               | Role                                                                |
|--------------------|---------------------------------------------------------------------|
| `types.ts`         | `STATE_TRANSITIONS` (valid transition map), `StateTransitionEvent`  |
| `state-machine.ts` | `StateMachine` class -- `resolveTargetState()`, `transition()`      |
| `orchestrator.ts`  | `Orchestrator` class -- `handleMessage()`, `checkEscalationPolicy()`|

**Key Design Decisions:**
- The orchestrator is the only component that coordinates across all bounded contexts; no other component has cross-cutting dependencies.
- State transitions are validated against a static transition table. Invalid transitions are silently rejected (logged as warnings).
- Escalation policy checks are evaluated in a fixed priority order, short-circuiting on the first match.

### 9.3 Agent Core (`src/agent/`)

**Responsibility:** Interface with OpenAI gpt-5.2 for natural language understanding. Assembles prompts from versioned bundles, knowledge context, and conversation history. Enforces a structured JSON response contract.

| File                  | Role                                                               |
|-----------------------|--------------------------------------------------------------------|
| `types.ts`            | `PromptBundle`, `LLMMessage`                                      |
| `prompt-manager.ts`   | Loads versioned prompt bundles from `prompts/` directory           |
| `response-contract.ts`| JSON Schema for LLM output; `parseAgentResponse()` parser         |
| `agent-core.ts`       | `AgentCore` class -- OpenAI client, circuit breaker, `process()`  |

**Key Design Decisions:**
- **Structured output**: The LLM is instructed to return `response_format: json_object` matching `RESPONSE_CONTRACT_SCHEMA`. This guarantees machine-parseable responses with intent, extracted fields, escalation signals, ticket update payloads, and tool calls.
- **Circuit breaker**: After 5 consecutive LLM failures, all requests receive a fallback response for 60 seconds. The fallback auto-escalates via `handoff_to_human`.
- **Prompt versioning**: Each version is a triplet of `{system.md, developer.md, brand_tone.md}` files, gated by an `approved` flag in `prompts/versions.json`. Unapproved versions are never loaded.

### 9.4 Tool Runtime (`src/tools/`)

**Responsibility:** Registry of executable tools, governed execution with schema validation, rate limiting, feature flag checks, channel/tenant allowlists, and timeout enforcement.

| File                                   | Role                                                 |
|----------------------------------------|------------------------------------------------------|
| `types.ts`                             | `ToolDefinition`, `ToolContext`, `ToolResult`, `ToolCallLog` |
| `registry.ts`                          | `ToolRegistry` singleton; `registerBuiltinTools()`   |
| `runtime.ts`                           | `ToolRuntime` -- 7-step governance chain              |
| `implementations/get-product-info.ts`  | Looks up product catalog from KnowledgeService       |
| `implementations/create-lead.ts`       | Creates a lead in CRM via SalesIQ/Zoho API           |
| `implementations/update-lead.ts`       | Updates existing lead fields                         |
| `implementations/create-ticket-note.ts`| Adds a note to an existing ticket                    |
| `implementations/schedule-meeting.ts`  | Books a meeting/demo                                 |
| `implementations/handoff-to-human.ts`  | Triggers human agent escalation                      |

**Tool Governance Chain (7 steps):**

1. **Registry lookup** -- does the tool exist?
2. **Tenant allowlist** -- is the tool enabled for this tenant globally?
3. **Channel allowlist** -- is the tool permitted on this channel (per `ToolDefinition.allowedChannels`)?
4. **Rate limiting** -- per-tool, per-tenant, 1-minute sliding window
5. **Schema validation** -- Ajv validates `args` against `tool.inputSchema`
6. **Execution with timeout** -- `Promise.race` with 15-second timeout
7. **Structured logging** -- PII-redacted `ToolCallLog` record emitted

### 9.5 Knowledge Layer (`src/knowledge/`)

**Responsibility:** Provide contextual knowledge from FAQ, product catalog, and policy documents to augment LLM prompts.

| File                   | Role                                                          |
|------------------------|---------------------------------------------------------------|
| `types.ts`             | `FAQEntry`, `ProductEntry`, `PolicyEntry`, `KnowledgeSearchResult` |
| `knowledge-service.ts` | `KnowledgeService` -- loads YAML, keyword search, context builder |

**Knowledge Sources (YAML):**

| File              | Schema                                                 |
|-------------------|--------------------------------------------------------|
| `faq.yaml`        | `{ question, answer, category, tags[] }`               |
| `products.yaml`   | `{ id, name, description, features[], pricing? }`      |
| `policies.yaml`   | `{ id, title, content }`                               |

**Search Algorithm:** Term-frequency scoring over whitespace-tokenized query terms. Results are scored as `matchedTerms / totalTerms`, filtered by a 0.2 threshold, sorted descending, and truncated to `topK` (default 5). This is designed to be replaced by vector similarity search when RAG is enabled (`RAG_ENABLED=true`).

### 9.6 Ticketing Service (`src/ticketing/`)

**Responsibility:** Create and update support tickets in Zoho Desk / SalesIQ. Maps internal ticket statuses to Zoho statuses.

| File                    | Role                                                        |
|-------------------------|-------------------------------------------------------------|
| `types.ts`              | `CreateTicketParams`, `UpdateTicketParams`, `TicketingService` interface |
| `salesiq-ticketing.ts`  | Production implementation using Zoho SalesIQ/Desk REST API  |
| `mock-ticketing.ts`     | In-memory mock for development/testing                      |
| `ticketing-service.ts`  | Factory function -- returns SalesIQ or mock based on env    |

**Status Mapping:**

| Zobot Status   | Zoho Desk Status |
|----------------|------------------|
| `Open`         | `Open`           |
| `Pending`      | `On Hold`        |
| `Escalated`    | `Escalated`      |
| `Resolved`     | `Closed`         |

**Ticket Lifecycle:**
- **Creation**: Automatic on first message (`state=NEW`) when `autoCreateOnNew=true` in tenant config
- **Updates**: After every message -- summary, tags, status, lead fields, intent classification
- **Custom Fields**: Stored as `cf_` prefixed fields: `cf_conversation_id`, `cf_visitor_id`, `cf_channel`, `cf_intent`

### 9.7 Observability (`src/observability/`)

**Responsibility:** Structured logging, Prometheus metrics, distributed tracing, and PII redaction.

| File               | Role                                                           |
|--------------------|----------------------------------------------------------------|
| `logger.ts`        | Pino logger configured for JSON output                        |
| `metrics.ts`       | 8 Prometheus metric families exposed at `GET /metrics`         |
| `trace.ts`         | Lightweight span-based tracing (`TraceContext`, `startSpan`)   |
| `pii-redactor.ts`  | Redacts sensitive fields from log payloads                     |

**Prometheus Metrics:**

| Metric Name                             | Type      | Labels                           |
|-----------------------------------------|-----------|----------------------------------|
| `zobot_http_request_duration_seconds`   | Histogram | method, route, status_code       |
| `zobot_messages_processed_total`        | Counter   | channel, tenant                  |
| `zobot_llm_request_duration_seconds`    | Histogram | model, status                    |
| `zobot_tool_call_duration_seconds`      | Histogram | tool, version, status            |
| `zobot_ticket_operations_total`         | Counter   | operation, status                |
| `zobot_escalations_total`              | Counter   | reason, channel                  |
| `zobot_state_transitions_total`         | Counter   | from, to                         |
| `zobot_active_conversations`            | Gauge     | channel                          |

### 9.8 Config Service (`src/config/`)

**Responsibility:** Multi-tenant configuration management. Loads tenant configs from JSON files, provides feature flags, channel policies, escalation thresholds, and tool enablement checks.

| File                | Role                                                          |
|---------------------|---------------------------------------------------------------|
| `env.ts`            | Environment variable loading with defaults                    |
| `types.ts`          | All shared type definitions (Channel, ConversationState, etc.)|
| `config-service.ts` | `ConfigService` -- loads tenant JSON, `isToolEnabled()` check |

**Tenant Configuration Structure:**

```
TenantConfig {
  tenantId              -- unique identifier
  enabledTools[]        -- global tool allowlist
  channelPolicies {
    whatsapp            -- { enabledTools[], maxTurnsBeforeEscalation, streamingEnabled }
    business_chat       -- { enabledTools[], maxTurnsBeforeEscalation, streamingEnabled }
    web                 -- { enabledTools[], maxTurnsBeforeEscalation, streamingEnabled }
  }
  escalationThresholds {
    maxClarifications   -- (default: 2)
    frustrationKeywords -- string[]
    escalationIntents   -- string[]
  }
  ticketCreationPolicy {
    autoCreateOnNew     -- boolean
    autoSummarizeOnUpdate -- boolean
    tagPrefix           -- string (default: "zobot")
  }
  promptVersion         -- which prompt bundle to use (e.g., "v1")
  featureFlags          -- Record<string, boolean>
}
```

---

## 10. Cross-Cutting Concerns

### 10.1 Security (`src/security/`)

| Concern               | Implementation                                                    |
|-----------------------|-------------------------------------------------------------------|
| Webhook Auth          | HMAC-SHA256 signature verification using `X-Zoho-Signature` header. Timing-safe comparison via `crypto.timingSafeEqual`. Skipped in dev mode when no secret is configured. |
| Visitor Rate Limiting | Sliding-window counter. Default: 30 requests per 60 seconds per visitor. |
| Tenant Rate Limiting  | Sliding-window counter. Default: 300 requests per 60 seconds per tenant. |
| Abuse Detection       | Spam pattern regex (repeated chars), message length limits (5000 chars), duplicate flood detection (3 identical messages in 10 seconds), visitor blocklist. |
| Admin Auth            | Static API key (`X-Admin-Api-Key` header) for admin endpoints.    |
| PII Protection        | `pii-redactor.ts` strips sensitive fields from log payloads. Tool call args are redacted before logging. |

### 10.2 Resilience Patterns

| Pattern              | Implementation                                                     |
|----------------------|--------------------------------------------------------------------|
| Circuit Breaker      | AgentCore: opens after 5 consecutive LLM failures, resets after 60s. Returns fallback response with auto-escalation. |
| Graceful Degradation | Redis unavailable: falls back to in-memory conversation store. SalesIQ token missing: uses mock ticketing service. |
| Timeout Enforcement  | OpenAI: 30s configurable timeout. Tool execution: 15s hard timeout via `Promise.race`. SalesIQ API: 10s via `AbortSignal.timeout`. |
| Async Processing     | Webhook returns `200 Accepted` immediately. Message processing runs asynchronously to prevent webhook timeouts. |
| Fire-and-Forget      | Typing indicators are sent best-effort; errors are swallowed silently. |
| Retry Strategy       | OpenAI client: 2 max retries (built-in SDK). Redis: 5 retries with exponential backoff (200ms-2s). |

### 10.3 Health Checks

| Endpoint     | Type      | Checks                                        |
|--------------|-----------|------------------------------------------------|
| `GET /health`| Liveness  | Returns 200 if the process is running          |
| `GET /ready` | Readiness | Pings Redis and OpenAI; returns 503 if either fails |

---

## 11. Deployment Topology

```
+------------------------------------------------------------------+
|                    Production Environment                        |
+------------------------------------------------------------------+

  +-----------+      +------------------+      +------------------+
  | Load      |      | Zobot Instance 1 |      | Zobot Instance N |
  | Balancer  +----->| (Node.js)        |  ... | (Node.js)        |
  | (TLS)     |      | Port 3000        |      | Port 3000        |
  +-----------+      +--------+---------+      +--------+---------+
                              |                         |
              +---------------+-------------------------+
              |               |                         |
      +-------v------+ +-----v-------+  +--------------v-----------+
      | Redis Cluster | | OpenAI API  |  | Zoho SalesIQ / Desk API |
      | (shared state)| | (gpt-5.2)  |  | (ticketing + messaging) |
      +--------------+ +-------------+  +-------------------------+
              |
      +-------v------+
      | Prometheus   |
      | (scrapes     |
      |  /metrics)   |
      +--------------+

  Environment Variables:
  +----------------------------------------------------------+
  | Required:                                                |
  |   OPENAI_API_KEY         -- OpenAI API key               |
  |   ADMIN_API_KEY          -- Admin endpoint auth          |
  |                                                          |
  | Required for Production:                                 |
  |   SALESIQ_APP_ID         -- SalesIQ application ID       |
  |   SALESIQ_ACCESS_TOKEN   -- Zoho OAuth token             |
  |   SALESIQ_WEBHOOK_SECRET -- Webhook HMAC secret          |
  |   REDIS_URL              -- Redis connection string      |
  |                                                          |
  | Optional:                                                |
  |   PORT                   -- Server port (default: 3000)  |
  |   NODE_ENV               -- development | production     |
  |   OPENAI_MODEL           -- LLM model (default: gpt-5.2)|
  |   OPENAI_MAX_TOKENS      -- Max tokens (default: 2048)  |
  |   OPENAI_TEMPERATURE     -- Temperature (default: 0.3)  |
  |   OPENAI_TIMEOUT_MS      -- LLM timeout (default: 30000)|
  |   LOG_LEVEL              -- Pino log level (default: info)|
  |   RAG_ENABLED            -- Enable RAG (default: false)  |
  +----------------------------------------------------------+
```

### Scaling Considerations

- **Horizontal scaling**: Multiple Zobot instances behind a load balancer, sharing Redis for conversation state. Each instance is stateless (aside from in-memory rate limit counters which are per-instance approximations).
- **Redis requirement for multi-instance**: When running multiple instances, Redis is required for consistent conversation state. The in-memory fallback is single-instance only.
- **Rate limiter note**: The current in-memory sliding-window rate limiter is per-instance. For accurate cross-instance rate limiting in production, replace with a Redis-backed GCRA or sliding window algorithm (noted in the source as a TODO).
- **Graceful shutdown**: SIGTERM/SIGINT handlers close the Fastify server and disconnect Redis before process exit.

---

## Appendix A: Directory Structure

```
src/
  index.ts                          -- Entry point; starts Fastify server
  app.ts                            -- Application bootstrap; wires all components
  config/
    env.ts                          -- Environment variable loader
    types.ts                        -- Shared type definitions (Channel, ConversationState, etc.)
    config-service.ts               -- Multi-tenant config loader
  channels/
    types.ts                        -- SalesIQ payload types, ChannelOutbound interface
    salesiq-adapter.ts              -- Inbound parser + outbound REST adapter
    salesiq-webhook.ts              -- Fastify webhook route handler
  orchestrator/
    types.ts                        -- State transition table, transition event type
    state-machine.ts                -- Finite state machine with validation
    orchestrator.ts                 -- 15-step message processing pipeline
  agent/
    types.ts                        -- PromptBundle, LLMMessage
    prompt-manager.ts               -- Versioned prompt loader
    response-contract.ts            -- LLM response JSON Schema + parser
    agent-core.ts                   -- OpenAI client with circuit breaker
  tools/
    types.ts                        -- ToolDefinition, ToolContext, ToolResult
    registry.ts                     -- Tool registry + OpenAI function definitions
    runtime.ts                      -- Governed tool execution (7-step chain)
    implementations/
      get-product-info.ts           -- Product catalog lookup
      create-lead.ts                -- CRM lead creation
      update-lead.ts                -- CRM lead update
      create-ticket-note.ts         -- Ticket note creation
      schedule-meeting.ts           -- Meeting/demo booking
      handoff-to-human.ts           -- Human agent escalation
  knowledge/
    types.ts                        -- FAQ, Product, Policy entry types
    knowledge-service.ts            -- YAML loader + keyword search
  ticketing/
    types.ts                        -- Ticketing service interface
    salesiq-ticketing.ts            -- Zoho SalesIQ/Desk implementation
    mock-ticketing.ts               -- In-memory mock for dev/test
    ticketing-service.ts            -- Factory (SalesIQ vs mock)
  memory/
    types.ts                        -- ConversationRecord, ConversationStore interface
    conversation-memory.ts          -- Redis + in-memory stores, memory merge
  observability/
    logger.ts                       -- Pino structured logger
    metrics.ts                      -- Prometheus metrics (8 families)
    trace.ts                        -- Span-based distributed tracing
    pii-redactor.ts                 -- PII field redaction
  security/
    webhook-verifier.ts             -- HMAC-SHA256 webhook signature verification
    rate-limiter.ts                 -- Sliding-window rate limiter (visitor + tenant)
    abuse-detector.ts               -- Spam detection + flood protection
  admin/
    admin-routes.ts                 -- Admin API (config reload, config read)
  health/
    health-routes.ts                -- Liveness + readiness probes + metrics endpoint

config/tenants/
  default.json                      -- Default tenant configuration

prompts/
  versions.json                     -- Prompt version registry (approved flag gating)
  system.md                         -- System prompt
  developer.md                      -- Developer instructions prompt
  brand_tone.md                     -- Brand voice/tone prompt

knowledge/
  faq.yaml                          -- FAQ entries
  products.yaml                     -- Product catalog
  policies.yaml                     -- Business policies
```
