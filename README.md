# Zobot — Enterprise AI Customer Service Platform

Production-grade, multi-channel AI chatbot for **Dentalkart** (India's leading dental products e-commerce platform). Handles WhatsApp, Business Chat, and website conversations through an intelligent agent with multi-LLM support, self-learning pipeline, and enterprise chat session management.

## Architecture Overview

```
                          ┌─────────────┐
                          │   Visitors   │
                          │ (Dentists,   │
                          │  Clinics)    │
                          └──────┬───────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        ┌─────┴─────┐    ┌──────┴──────┐    ┌─────┴─────┐
        │ WhatsApp   │    │ Business    │    │ Web Chat  │
        │            │    │ Chat        │    │ Widget    │
        └─────┬──────┘    └──────┬──────┘    └─────┬─────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Zoho SalesIQ         │
                    │    (Webhook Gateway)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │        Zobot            │
                    │   ┌────────────────┐    │
                    │   │  Orchestrator  │    │
                    │   │  State Machine │    │
                    │   └───────┬────────┘    │
                    │           │              │
                    │   ┌───────▼────────┐    │
                    │   │   Agent Core   │    │
                    │   │  Multi-LLM     │    │
                    │   │  Router        │    │
                    │   └───────┬────────┘    │
                    │           │              │
                    │   ┌───────┼───────┐     │
                    │   ▼       ▼       ▼     │
                    │ OpenAI Claude  Gemini   │
                    │ gpt-5.2 Sonnet Flash    │
                    │           │              │
                    │   ┌───────▼────────┐    │
                    │   │  Tool Runtime  │    │
                    │   └───────┬────────┘    │
                    │           │              │
                    │   ┌───────┼───────┐     │
                    │   ▼       ▼       ▼     │
                    │ VineRetail Clickpost    │
                    │ (Orders) (Tracking)     │
                    │         DK Admin        │
                    │         (Returns)       │
                    └─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Learning Pipeline     │
                    │   (5 Analyzers,         │
                    │    Scheduler,           │
                    │    Knowledge Updater)   │
                    └─────────────────────────┘
```

## Features

### Core AI & Chat Engine
- **Multi-LLM support** — OpenAI GPT-5.2, Anthropic Claude Sonnet, Google Gemini Flash with automatic failover
- **3 routing strategies** — Config-based priority, intent-based routing, A/B testing
- **Multi-channel** — WhatsApp, Apple Business Chat, Web Widget via Zoho SalesIQ
- **Deterministic state machine** — NEW > ACTIVE_QA > ORDER_INQUIRY > SHIPMENT_TRACKING > RETURN_REFUND > PRODUCT_INQUIRY > LEAD_QUALIFICATION > SUPPORT_TRIAGE > ESCALATED > RESOLVED
- **Hindi/Hinglish language support** — Detects and responds in customer's language

### Enterprise Chat UI (Dev Mode)
- **Pre-chat form** — Name, email, phone collection with localStorage persistence
- **Session management** — End chat, start new chat, session reconnection on page reload
- **Chat history panel** — View all past conversations with state badges, CSAT stars, turn count
- **Transcript viewer** — Read-only view of past conversation transcripts
- **CSAT survey** — 5-star rating + feedback text after chat ends
- **Transcript download** — Export chat as `.txt` file
- **Sound notifications** — Web Audio API beep on bot messages (toggleable)
- **Widget mode** — Floating bubble with unread badge, expandable/collapsible
- **File upload** — Images, videos, PDFs with drag-and-drop and camera capture
- **Quick reply buttons** — Clickable suggestion chips
- **Timestamps** — Relative time ("2m ago") on every message

### 11 Festive Chat Themes
All themes are available to customers at any time via the theme picker. Suggested themes are auto-highlighted during festive periods.

| Theme | Colors | Season |
|-------|--------|--------|
| Light (default) | Blue/White | Always |
| Dark | Purple/Teal/Dark | Always |
| Diwali | Orange/Gold/Warm | Oct 15 - Nov 15 |
| New Year | Purple/Gold/Dark | Dec 25 - Jan 7 |
| Independence Day | Saffron/Green/White | Aug 10 - Aug 20 |
| Republic Day | Navy/Saffron | Jan 20 - Jan 31 |
| Ramadan | Emerald/Gold | Dynamic |
| Doctors Day | Teal/Medical | Jul 1 - Jul 3 |
| Christmas | Red/Green | Dec 20 - Dec 26 |
| Halloween | Orange/Purple/Dark | Oct 25 - Nov 1 |
| Easter | Pastel Purple/Pink | Dynamic |

### Self-Learning Pipeline
- **5 analyzers** — FAQ Discovery, Knowledge Gap, Escalation Patterns, Response Quality, Intent Patterns
- **Scheduled runs** — Configurable interval (default: 24 hours)
- **Knowledge updater** — Auto-generates FAQ candidates from conversation patterns
- **Prompt tracker** — Tracks prompt version performance metrics

### SOP-Driven Knowledge Base
- **Customer Classification** — Loyal (3+ orders), Regular (1-2 orders), High-Risk (frequent returns)
- **5-Step Return Workflow** — Verify Delivery > Identify Issue > Check Eligibility > Process Return > Resolution
- **6 Return Decision Rules** — Structured approval/rejection/escalation matrix
- **Crisp Return Summary Format** — Structured ticket updates with customer type, rule applied, action taken
- **Failed Delivery Handling** — Clickpost integration for re-delivery, address correction, RTO
- **Color/Variant Returns** — Exact match required, no substitution without consent
- **RP- Order Convention** — Replacement order tracking linked to original orders
- **Customer Not Responding Protocol** — 3-step reminder sequence (15min intervals)
- **11 Escalation Desks** — Operations, Purchase, Logistics, Payment, In-House, Product Specialist, Tech, Returns, Cancellation, Re-order, Sales, Quality

### Backend Tools (6 Integrations)
| Tool | Backend | Purpose |
|------|---------|---------|
| `lookup_customer_orders` | VineRetail | Search orders by phone/order number |
| `get_shipment_details` | VineRetail | Get AWB, carrier, items, dates for an order |
| `track_shipment` | Clickpost | Real-time courier tracking with status overrides |
| `check_return_status` | DK Admin | Return/refund status and admin remarks |
| `search_products` | DK Search | Product search with pricing, stock, images |
| `create_ticket_note` | Internal | Add notes to conversation tickets |
| `handoff_to_human` | SalesIQ | Escalate to human agent |

### Security
- **Webhook HMAC signature verification** (SHA-256)
- **Per-visitor and per-tenant rate limiting**
- **Abuse/flood detection** with auto-blocking
- **Prompt injection defense** — Ignores manipulation attempts
- **PII redaction** in logs — Phone numbers, emails masked
- **Internal system names hidden** — VineRetail, Clickpost never exposed to customers

### Observability
- **Structured JSON logging** (Pino)
- **25+ Prometheus metrics** — HTTP, LLM, tools, state transitions, escalations, sessions, CSAT, uploads
- **Request tracing** with span hierarchy
- **Health + readiness probes** for Kubernetes

## Quick Start

### Prerequisites
- Node.js >= 20
- Redis (optional; in-memory fallback for dev)
- At least one LLM API key (OpenAI, Anthropic, or Gemini)

### Install & Run

```bash
# Clone and install
git clone <repo-url> && cd zobot
npm install

# Configure
cp .env.example .env
# Edit .env — set at minimum:
#   OPENAI_API_KEY=sk-your-key
#   ADMIN_API_KEY=your-admin-secret

# Start development server
npm run dev

# Open chat UI
open http://localhost:3000
```

### Docker

```bash
docker-compose up --build    # App + Redis
# or
docker build -t zobot .
docker run -p 3000:3000 --env-file .env zobot
```

### Run Tests

```bash
npm test                     # All tests
npm run test:unit            # Unit tests
npm run test:integration     # Integration tests
npm run test:coverage        # Coverage report
```

## API Endpoints

### Production Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/salesiq` | Webhook HMAC | Inbound message handler from SalesIQ |
| GET | `/health` | None | Liveness probe |
| GET | `/ready` | None | Readiness probe (Redis + LLM check) |
| GET | `/metrics` | None | Prometheus metrics (25+ counters/gauges) |
| POST | `/admin/reload-config` | `X-Admin-Api-Key` | Hot-reload tenant configs |
| GET | `/admin/config/:tenantId` | `X-Admin-Api-Key` | View redacted tenant config |

### Dev/Chat UI Endpoints (development only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Enterprise Chat UI with themes, history, CSAT |
| POST | `/test/chat` | Synchronous test chat (request/response) |
| POST | `/chat/end` | End a conversation (marks RESOLVED) |
| GET | `/chat/history/:visitorId` | List visitor's past chat sessions |
| GET | `/chat/transcript/:conversationId` | Full transcript for a session |
| POST | `/chat/feedback` | Submit CSAT rating (1-5) + feedback |
| GET | `/chat/session/:conversationId` | Check session state (for reconnection) |
| POST | `/chat/upload` | Upload file (multipart/form-data) |
| GET | `/chat/uploads/:cid/:fileId` | Serve uploaded files |

### Admin/Learning Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/learning/insights` | `X-Admin-Api-Key` | Latest learning pipeline insights |
| POST | `/admin/learning/run` | `X-Admin-Api-Key` | Trigger manual pipeline run |
| GET | `/admin/learning/faq-candidates` | `X-Admin-Api-Key` | View discovered FAQ candidates |
| POST | `/admin/learning/faq-candidates/:id/approve` | `X-Admin-Api-Key` | Approve FAQ candidate |
| GET | `/admin/learning/prompt-performance` | `X-Admin-Api-Key` | Prompt version performance stats |

## Environment Variables

See `.env.example` for the complete list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | - | Anthropic Claude API key |
| `GEMINI_API_KEY` | No | - | Google Gemini API key |
| `ADMIN_API_KEY` | Yes | - | Admin endpoint auth key |
| `LLM_PRIMARY_PROVIDER` | No | `openai` | Primary LLM: openai/anthropic/gemini |
| `LLM_SECONDARY_PROVIDER` | No | `anthropic` | Failover LLM provider |
| `LLM_ROUTING_STRATEGY` | No | `config` | Routing: config/intent/ab_test |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection |
| `LEARNING_ENABLED` | No | `true` | Enable self-learning pipeline |
| `CHAT_SESSION_TTL_DAYS` | No | `90` | Session history retention |
| `CHAT_CSAT_ENABLED` | No | `true` | Enable CSAT surveys |
| `CHAT_MAX_UPLOAD_SIZE_MB` | No | `10` | Max file upload size |

*At least one LLM API key is required.

## Project Structure

```
zobot/
├── src/
│   ├── index.ts                          # Entry point, graceful shutdown
│   ├── app.ts                            # Fastify app builder, wiring
│   ├── config/
│   │   ├── env.ts                        # Environment variables
│   │   ├── types.ts                      # Core types (Channel, State, Turn, etc.)
│   │   └── config-service.ts             # Multi-tenant config management
│   ├── channels/
│   │   ├── types.ts                      # Channel adapter interfaces
│   │   ├── salesiq-adapter.ts            # SalesIQ inbound/outbound adapter
│   │   ├── salesiq-webhook.ts            # SalesIQ webhook handler
│   │   ├── test-chat-endpoint.ts         # Dev synchronous chat endpoint
│   │   ├── chat-session-routes.ts        # Session management API (end, history, CSAT)
│   │   ├── chat-upload.ts               # File upload handler
│   │   └── chat-ui.ts                   # Enterprise chat UI (themes, history, CSAT)
│   ├── session/
│   │   ├── types.ts                      # Session store interfaces
│   │   └── session-store.ts              # Redis + InMemory session stores
│   ├── orchestrator/
│   │   ├── types.ts                      # State transition definitions
│   │   ├── state-machine.ts              # Deterministic state machine
│   │   └── orchestrator.ts               # Central message orchestration
│   ├── agent/
│   │   ├── types.ts                      # LLM message types
│   │   ├── prompt-manager.ts             # Versioned prompt loading
│   │   ├── response-contract.ts          # Structured response parsing
│   │   └── agent-core.ts                # Multi-LLM client with tool feedback
│   ├── llm/
│   │   ├── types.ts                      # Provider interfaces, routing types
│   │   ├── provider-factory.ts           # Build provider stack from config
│   │   ├── model-router.ts              # Multi-LLM routing + failover
│   │   └── providers/
│   │       ├── openai-provider.ts        # OpenAI GPT implementation
│   │       ├── anthropic-provider.ts     # Anthropic Claude implementation
│   │       └── gemini-provider.ts        # Google Gemini implementation
│   ├── tools/
│   │   ├── types.ts                      # Tool definition types
│   │   ├── registry.ts                   # Tool registration
│   │   ├── runtime.ts                    # Governed tool execution
│   │   └── implementations/
│   │       ├── lookup-customer-orders.ts # VineRetail order lookup
│   │       ├── get-shipment-details.ts   # VineRetail shipment details
│   │       ├── track-shipment.ts         # Clickpost real-time tracking
│   │       ├── check-return-status.ts    # DK Admin returns API
│   │       ├── search-products.ts        # DK product search
│   │       ├── create-ticket-note.ts     # Internal ticket notes
│   │       └── handoff-to-human.ts       # Human escalation
│   ├── learning/
│   │   ├── learning-store.ts             # Learning data persistence
│   │   ├── conversation-collector.ts     # Collect resolved conversations
│   │   ├── pipeline.ts                   # Learning pipeline orchestrator
│   │   ├── scheduler.ts                  # Cron-like scheduler
│   │   ├── knowledge-updater.ts          # Apply insights to knowledge base
│   │   ├── prompt-tracker.ts             # Prompt version performance
│   │   └── analyzers/
│   │       ├── faq-discovery.ts          # Discover FAQ candidates
│   │       ├── knowledge-gap.ts          # Identify knowledge gaps
│   │       ├── escalation-patterns.ts    # Analyze escalation triggers
│   │       ├── response-quality.ts       # Score response effectiveness
│   │       └── intent-patterns.ts        # Cluster intent patterns
│   ├── knowledge/
│   │   ├── types.ts                      # Knowledge entry types
│   │   └── knowledge-service.ts          # YAML-based knowledge search
│   ├── memory/
│   │   ├── types.ts                      # Conversation record types
│   │   └── conversation-memory.ts        # Redis + InMemory stores
│   ├── ticketing/
│   │   ├── types.ts                      # Ticketing interface
│   │   ├── salesiq-ticketing.ts          # SalesIQ/Zoho Desk implementation
│   │   ├── mock-ticketing.ts             # Dev mock
│   │   └── ticketing-service.ts          # Factory
│   ├── observability/
│   │   ├── logger.ts                     # Pino structured logger
│   │   ├── metrics.ts                    # 25+ Prometheus metrics
│   │   ├── trace.ts                      # Request tracing
│   │   └── pii-redactor.ts              # PII masking
│   ├── security/
│   │   ├── rate-limiter.ts              # Per-visitor/tenant rate limiting
│   │   ├── abuse-detector.ts            # Spam/flood detection
│   │   └── webhook-verifier.ts          # HMAC signature verification
│   ├── admin/
│   │   └── admin-routes.ts              # Config + learning admin endpoints
│   └── health/
│       └── health-routes.ts             # Health + readiness + metrics
├── config/tenants/
│   └── default.json                     # Dentalkart tenant configuration
├── prompts/
│   ├── system.md                        # System prompt (agent identity, rules)
│   └── developer.md                     # Developer prompt (workflows, tools)
├── knowledge/
│   ├── faq.yaml                         # 110+ FAQ entries
│   ├── policies.yaml                    # 20 policy documents
│   └── escalation-matrix.yaml           # 11 escalation desks with TATs
├── .env.example                         # Environment variable template
├── Dockerfile                           # Multi-stage production build
├── docker-compose.yml                   # App + Redis
├── package.json                         # Dependencies and scripts
└── tsconfig.json                        # TypeScript configuration
```

## Multi-LLM Configuration

### Provider Setup
Configure one or more LLM providers in `.env`:

```bash
# Primary (required)
LLM_PRIMARY_PROVIDER=openai
OPENAI_API_KEY=sk-xxx

# Secondary failover (optional)
LLM_SECONDARY_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Tertiary failover (optional)
LLM_TERTIARY_PROVIDER=gemini
GEMINI_API_KEY=AIza-xxx
```

### Routing Strategies

- **`config`** — Always use primary; failover to secondary/tertiary on error
- **`intent`** — Route based on detected intent (future enhancement)
- **`ab_test`** — Split traffic between primary and secondary by percentage

```bash
LLM_ROUTING_STRATEGY=config    # or: intent, ab_test
LLM_AB_TEST_SPLIT=50           # % traffic to secondary (for ab_test)
```

## Tenant Configuration

Each tenant has a JSON config in `config/tenants/{tenantId}.json` controlling:
- Enabled tools per channel
- Escalation thresholds and frustration keywords
- Channel-specific policies (max turns, streaming, support hours)
- Feature flags
- Customer not responding policy
- Ticket creation settings

Hot-reload without restart:
```bash
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: your-admin-key"
```

## Prometheus Metrics

Key metrics exposed at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `zobot_http_request_duration_seconds` | Histogram | HTTP request latency |
| `zobot_messages_processed_total` | Counter | Messages by channel/tenant |
| `zobot_llm_request_duration_seconds` | Histogram | LLM API call latency |
| `zobot_llm_provider_failovers_total` | Counter | Provider failover events |
| `zobot_tool_call_duration_seconds` | Histogram | Tool execution latency |
| `zobot_escalations_total` | Counter | Escalations by reason/channel |
| `zobot_state_transitions_total` | Counter | State machine transitions |
| `zobot_active_conversations` | Gauge | Current active conversations |
| `zobot_learning_pipeline_runs_total` | Counter | Learning pipeline executions |
| `zobot_bot_resolution_rate` | Gauge | % resolved without escalation |
| `zobot_chat_sessions_created_total` | Counter | Chat sessions created |
| `zobot_chat_sessions_ended_total` | Counter | Chat sessions ended |
| `zobot_csat_submissions_total` | Counter | CSAT survey submissions |
| `zobot_csat_average_rating` | Gauge | Average CSAT rating |
| `zobot_file_uploads_total` | Counter | File uploads by type |

## Connecting to Production SalesIQ

1. Set environment variables: `SALESIQ_APP_ID`, `SALESIQ_ACCESS_TOKEN`, `SALESIQ_WEBHOOK_SECRET`
2. Configure SalesIQ to POST webhook to: `https://your-domain/webhooks/salesiq`
3. The outbound adapter (`salesiq-adapter.ts`) sends replies via SalesIQ REST API
4. Ticketing service (`salesiq-ticketing.ts`) creates/updates Zoho Desk tickets

## License

Proprietary - Internal use only.
