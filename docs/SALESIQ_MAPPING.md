# SalesIQ Payload Mapping and Ticket Workflow

This document describes how the Zobot platform integrates with Zoho SalesIQ for WhatsApp, Apple Business Chat, and Website widget channels. It covers inbound webhook parsing, outbound API calls, ticket lifecycle management, and where to plug in real API credentials.

---

## Table of Contents

1. [Webhook Inbound Mapping](#1-webhook-inbound-mapping)
2. [Outbound API Mapping](#2-outbound-api-mapping)
3. [Ticket API Mapping](#3-ticket-api-mapping)
4. [Ticket Workflow](#4-ticket-workflow)
5. [Where to Plug Real APIs](#5-where-to-plug-real-apis)
6. [Known Assumptions and Limitations](#6-known-assumptions-and-limitations)

---

## 1. Webhook Inbound Mapping

### Endpoint

SalesIQ sends a `POST` request to:

```
POST /webhooks/salesiq
```

Registered in `src/channels/salesiq-webhook.ts` via `registerSalesIQWebhook()`.

### Required Headers

| Header             | Purpose                                                                 |
|--------------------|-------------------------------------------------------------------------|
| `X-Zoho-Signature` | HMAC-SHA256 signature of the raw request body, verified against `SALESIQ_WEBHOOK_SECRET`. In development mode (no secret configured), verification is skipped. |
| `X-Tenant-Id`      | Multi-tenant routing. If absent, falls back to `DEFAULT_TENANT_ID` env var. |
| `Content-Type`     | Must be `application/json`.                                             |

### Signature Verification

Implemented in `src/security/webhook-verifier.ts`. The verification computes:

```
HMAC-SHA256(rawBody, SALESIQ_WEBHOOK_SECRET)
```

and performs a timing-safe comparison against the value in `X-Zoho-Signature`. If `SALESIQ_WEBHOOK_SECRET` is empty:
- **Development mode**: verification is skipped (returns `true`).
- **Production mode**: the request is rejected (returns `false`).

### Expected Payload Structure

SalesIQ delivers a JSON body with the following shape:

```json
{
  "event": "chat.message",
  "data": {
    "chat": {
      "id": "chat_5f8a2b3c4d",
      "channel": "whatsapp"
    },
    "visitor": {
      "id": "visitor_9e7d6c5b4a",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+15551234567",
      "info": {
        "company": "Acme Corp",
        "plan": "enterprise"
      }
    },
    "message": {
      "text": "I need help with my billing issue",
      "attachments": [
        {
          "type": "image",
          "url": "https://files.zoho.com/abc123.png",
          "name": "screenshot.png"
        }
      ]
    },
    "department": {
      "id": "dept_001",
      "name": "Billing"
    }
  }
}
```

The TypeScript interface for this payload is `SalesIQWebhookPayload` in `src/channels/types.ts`.

### Field Mapping to InboundMessage

The function `parseSalesIQWebhook()` in `src/channels/salesiq-adapter.ts` transforms the raw payload into the normalized `InboundMessage` type defined in `src/config/types.ts`.

| SalesIQ Field             | InboundMessage Field                | Notes                                                                                  |
|---------------------------|-------------------------------------|----------------------------------------------------------------------------------------|
| `data.chat.id`            | `conversationId`                    | Required. Parse fails if missing.                                                      |
| `data.chat.channel`       | `channel`                           | Mapped via `mapChannel()` -- see channel mapping logic below.                          |
| `data.visitor.id`         | `visitorId`                         | Required. Parse fails if missing.                                                      |
| `data.visitor.email`      | `contactId`                         | Used as `contactId` if present (email serves as unique contact identifier).            |
| `data.visitor.name`       | `userProfile.name`                  | Optional.                                                                              |
| `data.visitor.email`      | `userProfile.email`                 | Optional.                                                                              |
| `data.visitor.phone`      | `userProfile.phone`                 | Optional.                                                                              |
| `data.visitor.info`       | `userProfile.attributes`            | Key-value pairs cast to `Record<string, string>`.                                      |
| `data.message.text`       | `message.text`                      | Required. Parse fails if missing.                                                      |
| `data.message.attachments`| `message.attachments`               | Each attachment is mapped to `{ type, url, name }`.                                    |
| (computed)                | `timestamp`                         | Set to `Date.now()` at parse time.                                                     |
| (full payload)            | `raw`                               | Stored only in development mode (`env.isDev`).                                         |
| (from header)             | `tenantId`                          | From `X-Tenant-Id` header or `DEFAULT_TENANT_ID` fallback.                            |
| (not mapped)              | `userProfile.locale`                | Always `undefined`; SalesIQ does not provide locale in the standard payload.           |
| (not mapped)              | `userProfile.timezone`              | Always `undefined`; SalesIQ does not provide timezone in the standard payload.         |

### Channel Mapping Logic

The `mapChannel()` function in `src/channels/salesiq-adapter.ts` normalizes `data.chat.channel` to the canonical `Channel` type:

| SalesIQ `data.chat.channel` value          | Normalized `Channel` |
|--------------------------------------------|-----------------------|
| Contains `"whatsapp"` (case-insensitive)   | `whatsapp`            |
| Contains `"business_chat"`, `"businesschat"`, or `"apple"` (case-insensitive) | `business_chat` |
| Anything else, or missing                  | `web`                 |

### Parsed InboundMessage Example

Given the sample payload above, `parseSalesIQWebhook()` produces:

```json
{
  "channel": "whatsapp",
  "conversationId": "chat_5f8a2b3c4d",
  "visitorId": "visitor_9e7d6c5b4a",
  "contactId": "jane@example.com",
  "userProfile": {
    "name": "Jane Doe",
    "phone": "+15551234567",
    "email": "jane@example.com",
    "locale": null,
    "timezone": null,
    "attributes": {
      "company": "Acme Corp",
      "plan": "enterprise"
    }
  },
  "message": {
    "text": "I need help with my billing issue",
    "attachments": [
      {
        "type": "image",
        "url": "https://files.zoho.com/abc123.png",
        "name": "screenshot.png"
      }
    ]
  },
  "timestamp": 1740100000000,
  "tenantId": "acme-corp"
}
```

### Webhook Processing Pipeline

After parsing, the webhook handler in `src/channels/salesiq-webhook.ts` executes the following steps in order:

1. **Signature verification** -- reject with `401` if invalid.
2. **Payload parsing** -- reject with `400` if required fields are missing.
3. **Visitor rate limiting** -- reject with `429` if the visitor exceeds `RATE_LIMIT_PER_VISITOR` messages per `RATE_LIMIT_WINDOW_SECONDS`.
4. **Tenant rate limiting** -- reject with `429` if the tenant exceeds `RATE_LIMIT_PER_TENANT` messages per window.
5. **Abuse detection** -- silently absorb with `200` and `{ status: "blocked" }` if message content triggers abuse filters.
6. **Metrics increment** -- increment the `messages_processed` counter by channel and tenant.
7. **Async handoff to Orchestrator** -- respond `200 { status: "accepted" }` immediately; the Orchestrator processes the message asynchronously to avoid webhook timeouts.

### Response Codes

| Code | Meaning                                      |
|------|----------------------------------------------|
| 200  | Accepted (processing asynchronously) or blocked silently. |
| 400  | Missing required fields in the payload.      |
| 401  | Invalid or missing webhook signature.        |
| 429  | Rate limit exceeded (visitor or tenant).     |
| 500  | Unexpected internal error.                   |

---

## 2. Outbound API Mapping

All outbound calls are made by `SalesIQOutboundAdapter` in `src/channels/salesiq-adapter.ts`. The class implements the `ChannelOutbound` interface from `src/channels/types.ts`.

### Base URL Construction

All endpoints follow the pattern:

```
{SALESIQ_BASE_URL}/api/v2/{SALESIQ_APP_ID}{path}
```

Default `SALESIQ_BASE_URL` is `https://salesiq.zoho.com`.

### Authentication Header

Every outbound request includes:

```
Authorization: Zoho-oauthtoken {SALESIQ_ACCESS_TOKEN}
Content-Type: application/json
```

---

### 2.1 sendMessage

Send a text reply to a visitor in an active chat.

**Method and Path:**

```
POST /api/v2/{appId}/chats/{conversationId}/messages
```

**Request Body:**

```json
{
  "message": {
    "text": "Thank you for contacting us! I can help you with your billing issue. Could you provide your account number?"
  },
  "sender": {
    "screen_name": "zobot",
    "type": "bot"
  }
}
```

The `screen_name` is read from `SALESIQ_SCREEN_NAME` (defaults to `"zobot"`).

**Expected Success Response (200):**

```json
{
  "data": {
    "message": {
      "id": "msg_abc123",
      "text": "Thank you for contacting us! I can help you with your billing issue. Could you provide your account number?",
      "time": "2026-02-21T10:15:30Z",
      "sender": {
        "screen_name": "zobot",
        "type": "bot"
      }
    }
  }
}
```

---

### 2.2 sendTyping

Send a typing indicator to show the bot is composing a response. This is best-effort; errors are silently swallowed.

**Method and Path:**

```
POST /api/v2/{appId}/chats/{conversationId}/typing
```

**Request Body:**

```json
{
  "typing": true,
  "sender": {
    "screen_name": "zobot",
    "type": "bot"
  }
}
```

**Expected Success Response (200):**

```json
{
  "data": {
    "typing": true
  }
}
```

---

### 2.3 escalateToHuman

Transfer the conversation from the bot to a human agent. Includes the reason for escalation and a context summary.

**Method and Path:**

```
POST /api/v2/{appId}/chats/{conversationId}/escalate
```

**Request Body:**

```json
{
  "reason": "Customer expressed frustration and requested a human agent",
  "summary": "Visitor Jane Doe contacted about a billing discrepancy on invoice #4521. Bot confirmed account details and identified a duplicate charge of $49.99. Visitor wants a refund processed immediately and asked to speak with a human."
}
```

**Expected Success Response (200):**

```json
{
  "data": {
    "escalated": true,
    "assignee": {
      "id": "agent_789",
      "name": "Support Agent"
    }
  }
}
```

---

### 2.4 addTags

Attach classification tags to a conversation for reporting and routing.

**Method and Path:**

```
PATCH /api/v2/{appId}/chats/{conversationId}/tags
```

**Request Body:**

```json
{
  "tags": [
    "billing",
    "refund-request",
    "high-priority"
  ]
}
```

**Expected Success Response (200):**

```json
{
  "data": {
    "tags": [
      "billing",
      "refund-request",
      "high-priority"
    ]
  }
}
```

---

### 2.5 setDepartment

Route or re-route the conversation to a specific department.

**Method and Path:**

```
PATCH /api/v2/{appId}/chats/{conversationId}
```

**Request Body:**

```json
{
  "department": {
    "id": "dept_billing_001"
  }
}
```

**Expected Success Response (200):**

```json
{
  "data": {
    "chat": {
      "id": "chat_5f8a2b3c4d",
      "department": {
        "id": "dept_billing_001",
        "name": "Billing"
      }
    }
  }
}
```

---

### Outbound Error Handling

All outbound methods (except `sendTyping`) throw on non-2xx responses. The error includes the HTTP status code and the response body:

```
SalesIQ API {statusCode}: {responseBody}
```

Errors are logged at `error` level via the structured logger. `sendTyping` is wrapped in a try-catch that swallows errors since typing indicators are non-critical.

---

## 3. Ticket API Mapping

All ticket operations are handled by `SalesIQTicketingService` in `src/ticketing/salesiq-ticketing.ts`. It implements the `TicketingService` interface from `src/ticketing/types.ts`.

### Base URL Construction

Same pattern as outbound:

```
{SALESIQ_BASE_URL}/api/v2/{SALESIQ_APP_ID}{path}
```

All requests include the standard `Authorization: Zoho-oauthtoken {token}` header and have a 10-second timeout (`AbortSignal.timeout(10_000)`).

---

### 3.1 createTicket

Create a new ticket linked to a conversation.

**Method and Path:**

```
POST /api/v2/{appId}/tickets
```

**Request Body:**

```json
{
  "subject": "Chat - whatsapp - visitor_9e7d6c5b4a",
  "description": "I need help with my billing issue",
  "channel": "whatsapp",
  "cf": {
    "cf_conversation_id": "chat_5f8a2b3c4d",
    "cf_visitor_id": "visitor_9e7d6c5b4a",
    "cf_channel": "whatsapp",
    "visitorName": "Jane Doe",
    "visitorEmail": "jane@example.com"
  },
  "tags": [
    "zobot:whatsapp",
    "zobot:new"
  ],
  "contactId": "jane@example.com"
}
```

**Expected Success Response (200/201):**

```json
{
  "id": "ticket_10042",
  "subject": "Chat - whatsapp - visitor_9e7d6c5b4a",
  "description": "I need help with my billing issue",
  "status": "Open",
  "createdTime": "2026-02-21T10:15:30Z",
  "modifiedTime": "2026-02-21T10:15:30Z",
  "cf": {
    "cf_conversation_id": "chat_5f8a2b3c4d",
    "cf_visitor_id": "visitor_9e7d6c5b4a",
    "cf_channel": "whatsapp"
  },
  "tags": [
    "zobot:whatsapp",
    "zobot:new"
  ]
}
```

**TypeScript Interface:**

The `CreateTicketParams` interface in `src/ticketing/types.ts`:

```typescript
interface CreateTicketParams {
  conversationId: string;
  channel: Channel;
  visitorId: string;
  contactId?: string;
  subject: string;
  description: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}
```

---

### 3.2 updateTicket

Update an existing ticket with new summary, status, tags, lead fields, or intent classification.

**Method and Path:**

```
PATCH /api/v2/{appId}/tickets/{ticketId}
```

**Request Body (all fields optional):**

```json
{
  "description": "Visitor Jane Doe has a billing discrepancy on invoice #4521. Duplicate charge of $49.99 identified. Refund requested.",
  "status": "Escalated",
  "tags": [
    "billing",
    "refund-request",
    "high-priority"
  ],
  "cf": {
    "company": "Acme Corp",
    "plan": "enterprise",
    "cf_intent": "billing_dispute"
  }
}
```

**Field Mapping in updateTicket():**

| UpdateTicketParams field    | API payload field        | Notes                                                  |
|-----------------------------|--------------------------|--------------------------------------------------------|
| `summary`                   | `description`            | Overwrites the ticket description with the latest summary. |
| `status`                    | `status`                 | Mapped through `mapStatus()` -- see status mapping below. |
| `tags`                      | `tags`                   | Replaces the full tag set.                             |
| `leadFields`                | `cf` (merged)            | Merged into the custom fields object.                  |
| `intentClassification`      | `cf.cf_intent`           | Added to custom fields alongside lead fields.          |

**Expected Success Response (200):**

```json
{
  "id": "ticket_10042",
  "subject": "Chat - whatsapp - visitor_9e7d6c5b4a",
  "description": "Visitor Jane Doe has a billing discrepancy on invoice #4521. Duplicate charge of $49.99 identified. Refund requested.",
  "status": "Escalated",
  "modifiedTime": "2026-02-21T10:20:45Z",
  "cf": {
    "cf_conversation_id": "chat_5f8a2b3c4d",
    "cf_visitor_id": "visitor_9e7d6c5b4a",
    "cf_channel": "whatsapp",
    "cf_intent": "billing_dispute",
    "company": "Acme Corp"
  },
  "tags": [
    "billing",
    "refund-request",
    "high-priority"
  ]
}
```

**TypeScript Interface:**

```typescript
interface UpdateTicketParams {
  ticketId: string;
  summary?: string;
  status?: TicketStatus;
  tags?: string[];
  leadFields?: Record<string, unknown>;
  intentClassification?: string;
  description?: string;
}
```

---

### 3.3 getTicket

Retrieve details of an existing ticket.

**Method and Path:**

```
GET /api/v2/{appId}/tickets/{ticketId}
```

**No request body.**

**Expected Success Response (200):**

```json
{
  "id": "ticket_10042",
  "subject": "Chat - whatsapp - visitor_9e7d6c5b4a",
  "description": "Visitor Jane Doe has a billing discrepancy...",
  "status": "Open",
  "createdTime": 1740100000000,
  "modifiedTime": 1740100500000,
  "cf": {
    "cf_conversation_id": "chat_5f8a2b3c4d",
    "cf_visitor_id": "visitor_9e7d6c5b4a",
    "cf_channel": "whatsapp",
    "cf_intent": "billing_dispute"
  },
  "tags": [
    "billing",
    "refund-request"
  ]
}
```

**Response Mapping to TicketData:**

| API response field              | TicketData field        |
|---------------------------------|-------------------------|
| `id`                            | `id`                    |
| `cf.cf_conversation_id`        | `conversationId`        |
| `cf.cf_channel`                | `channel`               |
| `subject`                       | `subject`               |
| `description`                   | `description`           |
| `status` (reverse-mapped)       | `status`                |
| `tags`                          | `tags`                  |
| `cf` (entire object)            | `customFields`          |
| `createdTime`                   | `createdAt`             |
| `modifiedTime`                  | `updatedAt`             |

If the GET call fails for any reason, `getTicket()` returns `null`.

---

### Custom Fields Mapping

The following custom field names are used to link tickets back to conversation data:

| Custom Field Name      | Purpose                                     | Set During       |
|------------------------|---------------------------------------------|------------------|
| `cf_conversation_id`   | Links the ticket to the SalesIQ chat ID     | `createTicket`   |
| `cf_visitor_id`        | Links the ticket to the visitor ID          | `createTicket`   |
| `cf_channel`           | Records the originating channel             | `createTicket`   |
| `cf_intent`            | Latest intent classification from the agent | `updateTicket`   |

Additional fields from `leadFields` (e.g., `company`, `plan`, `productInterest`) are merged into the `cf` object dynamically during updates.

---

### Status Mapping

The internal `TicketStatus` type maps bidirectionally to SalesIQ/Zoho Desk status strings:

**Internal to API (`mapStatus()`):**

| Internal `TicketStatus` | API Status String |
|-------------------------|-------------------|
| `Open`                  | `Open`            |
| `Pending`               | `On Hold`         |
| `Escalated`             | `Escalated`       |
| `Resolved`              | `Closed`          |

**API to Internal (`reverseMapStatus()`):**

| API Status String (case-insensitive match)       | Internal `TicketStatus` |
|--------------------------------------------------|-------------------------|
| Contains `"close"` or `"resolved"`               | `Resolved`              |
| Contains `"escalat"`                             | `Escalated`             |
| Contains `"hold"` or `"pending"`                 | `Pending`               |
| Anything else                                    | `Open`                  |

---

## 4. Ticket Workflow

The Orchestrator in `src/orchestrator/orchestrator.ts` drives the ticket lifecycle. Each step is traced via OpenTelemetry-style spans.

### 4.1 On NEW Conversation -- Create Ticket Immediately

When the first message arrives for a conversation that does not yet exist in the store:

1. Orchestrator checks the tenant config `ticketCreationPolicy.autoCreateOnNew`.
2. If `true`, calls `ticketing.createTicket()` with:
   - `subject`: `"Chat - {channel} - {visitorId}"` (e.g., `"Chat - whatsapp - visitor_9e7d6c5b4a"`)
   - `description`: The visitor's first message text.
   - `tags`: `["{tagPrefix}:{channel}", "{tagPrefix}:new"]` (e.g., `["zobot:whatsapp", "zobot:new"]`).
   - `customFields`: `{ visitorName, visitorEmail }` from the user profile.
   - `conversationId`, `channel`, `visitorId`, `contactId`: From the inbound message.
3. The returned `ticket.id` is stored in `record.ticketId` for the conversation.

**Sample Create Call (as generated by Orchestrator):**

```json
{
  "subject": "Chat - whatsapp - visitor_9e7d6c5b4a",
  "description": "I need help with my billing issue",
  "channel": "whatsapp",
  "cf": {
    "cf_conversation_id": "chat_5f8a2b3c4d",
    "cf_visitor_id": "visitor_9e7d6c5b4a",
    "cf_channel": "whatsapp",
    "visitorName": "Jane Doe",
    "visitorEmail": "jane@example.com"
  },
  "tags": ["zobot:whatsapp", "zobot:new"],
  "contactId": "jane@example.com"
}
```

### 4.2 On Each Subsequent Message -- Update Ticket

After the agent processes every message, if `record.ticketId` is set, the Orchestrator calls `ticketing.updateTicket()` with:

- `ticketId`: The stored ticket ID.
- `summary`: Latest conversation summary from `agentResponse.ticketUpdatePayload.summary`.
- `status`: From `agentResponse.ticketUpdatePayload.status`, overridden to `"Escalated"` if escalation is triggered.
- `tags`: From `agentResponse.ticketUpdatePayload.tags`.
- `leadFields`: From `agentResponse.ticketUpdatePayload.leadFields`, falling back to `agentResponse.extractedFields`.
- `intentClassification`: From `agentResponse.ticketUpdatePayload.intentClassification`, falling back to `agentResponse.intent`.

**Sample Update Call (mid-conversation):**

```json
{
  "description": "Visitor Jane Doe contacted about billing. Duplicate charge of $49.99 identified on invoice #4521. Refund requested. Bot confirmed account details.",
  "status": "Open",
  "tags": ["billing", "refund-request"],
  "cf": {
    "company": "Acme Corp",
    "plan": "enterprise",
    "cf_intent": "billing_dispute"
  }
}
```

### 4.3 On Escalation -- Mark Ticket Escalated

Escalation is triggered when any of these conditions are met (checked by `checkEscalationPolicy()`):

1. **Agent signals escalation**: `agentResponse.shouldEscalate === true`.
2. **Escalation intent detected**: `agentResponse.intent` matches a value in `tenantConfig.escalationThresholds.escalationIntents`.
3. **Frustration keywords**: The visitor's message contains any keyword from `tenantConfig.escalationThresholds.frustrationKeywords`.
4. **Max clarifications exceeded**: `record.clarificationCount >= tenantConfig.escalationThresholds.maxClarifications`.
5. **Max turns exceeded**: `record.turnCount >= channelPolicy.maxTurnsBeforeEscalation`.

When escalation triggers:

1. The ticket is updated with `status: "Escalated"` (maps to API status `"Escalated"`).
2. If the agent called the `handoff_to_human` tool, `outbound.escalateToHuman()` is also called with the reason and context summary.
3. The conversation state machine transitions to `ESCALATED`.

**Sample Escalation Update:**

```json
{
  "description": "Visitor Jane Doe escalated after 3 clarification attempts. Billing dispute on invoice #4521, duplicate charge $49.99. Customer requested human agent.",
  "status": "Escalated",
  "tags": ["billing", "refund-request", "escalated"],
  "cf": {
    "cf_intent": "escalation_request"
  }
}
```

### 4.4 On Resolution -- Mark Ticket Resolved

When the agent determines the conversation is resolved:

1. `agentResponse.ticketUpdatePayload.status` is set to `"Resolved"`.
2. The ticket is updated with `status: "Resolved"` (maps to API status `"Closed"`).
3. The conversation state machine transitions to `RESOLVED`.

**Sample Resolution Update:**

```json
{
  "description": "Billing dispute resolved. Duplicate charge of $49.99 refunded to Visa ending 4521. Confirmation email sent to jane@example.com.",
  "status": "Closed",
  "tags": ["billing", "refund-request", "resolved"],
  "cf": {
    "cf_intent": "billing_dispute"
  }
}
```

### Full Ticket Lifecycle Diagram

```
Visitor sends       Orchestrator            SalesIQ / Zoho Desk
first message  ---> createTicket()  ------> POST /tickets
                    (state = NEW)             -> returns ticketId

Visitor sends       Orchestrator            SalesIQ / Zoho Desk
message N      ---> updateTicket()  ------> PATCH /tickets/{ticketId}
                    (state = ACTIVE_QA)       -> summary, tags, intent, lead fields

Frustration or      Orchestrator            SalesIQ / Zoho Desk
max turns hit  ---> updateTicket()  ------> PATCH /tickets/{ticketId}
                    (status=Escalated)        -> status = "Escalated"
               ---> escalateToHuman() ----> POST /chats/{id}/escalate
                    (state = ESCALATED)       -> reason + summary

Agent resolves      Orchestrator            SalesIQ / Zoho Desk
the issue      ---> updateTicket()  ------> PATCH /tickets/{ticketId}
                    (status=Resolved)         -> status = "Closed"
                    (state = RESOLVED)
```

---

## 5. Where to Plug Real APIs

### 5.1 Channel Adapter: `src/channels/salesiq-adapter.ts`

This file contains two key exports:

- **`parseSalesIQWebhook()`** -- Parses inbound webhooks. Modify this function if SalesIQ changes its payload schema or if you need to extract additional fields.
- **`SalesIQOutboundAdapter`** class -- Sends messages back to visitors. The `apiCall()` private method is the single point for all outbound HTTP requests. To add new outbound operations, add a new method that calls `this.apiCall()`.

**Environment variables consumed:**

| Variable               | Purpose                      | Default                       |
|------------------------|------------------------------|-------------------------------|
| `SALESIQ_BASE_URL`     | SalesIQ API base URL         | `https://salesiq.zoho.com`    |
| `SALESIQ_APP_ID`       | Your SalesIQ application ID  | (empty)                       |
| `SALESIQ_ACCESS_TOKEN` | OAuth access token           | (empty)                       |
| `SALESIQ_SCREEN_NAME`  | Bot display name in chat     | `zobot`                       |
| `SALESIQ_WEBHOOK_SECRET` | HMAC secret for signature  | (empty)                       |

### 5.2 Ticketing Service: `src/ticketing/salesiq-ticketing.ts`

The `SalesIQTicketingService` class handles ticket CRUD. It uses the same `SALESIQ_BASE_URL`, `SALESIQ_APP_ID`, and `SALESIQ_ACCESS_TOKEN` environment variables.

Key implementation details:
- Maintains an in-memory `Map<conversationId, ticketId>` for `getTicketByConversationId()`. In production, this should be backed by Redis.
- The `apiCall()` method includes a 10-second timeout via `AbortSignal.timeout(10_000)`.
- All operations emit Prometheus metrics via `ticketOperations` counter.

### 5.3 Service Factory: `src/ticketing/ticketing-service.ts`

The `createTicketingService()` factory function decides which implementation to use:

```
if (SALESIQ_ACCESS_TOKEN && SALESIQ_APP_ID && NODE_ENV !== "development"):
    return SalesIQTicketingService
else:
    return MockTicketingService
```

### 5.4 Mock Ticketing: `src/ticketing/mock-ticketing.ts`

For local development and testing, `MockTicketingService` stores tickets in-memory with auto-incrementing IDs prefixed `MOCK-`. It provides:

- Full `TicketingService` interface implementation.
- `getAllTickets()` -- test helper to inspect all stored tickets.
- `reset()` -- test helper to clear state between tests.

No network calls are made. All operations log at info level with a `[MOCK]` prefix.

### 5.5 Webhook Registration: `src/channels/salesiq-webhook.ts`

The `registerSalesIQWebhook()` function registers the `POST /webhooks/salesiq` route on the Fastify app. It wires together signature verification, parsing, rate limiting, abuse detection, and orchestrator handoff.

---

## 6. Known Assumptions and Limitations

### API Endpoint Paths May Vary

The endpoint paths used in this codebase (`/api/v2/{appId}/chats/...`, `/api/v2/{appId}/tickets/...`) are based on the SalesIQ REST API v2 documentation. However:

- Endpoint paths may differ by SalesIQ plan tier (Free, Basic, Professional, Enterprise).
- Regional data centers may use different base URLs (e.g., `salesiq.zoho.eu`, `salesiq.zoho.in`, `salesiq.zoho.com.au`). Update `SALESIQ_BASE_URL` accordingly.
- The `/chats/{id}/escalate` and `/chats/{id}/typing` endpoints may not be available on all plans.

### Ticket API May Require Zoho Desk

SalesIQ's native ticket APIs may have limited functionality compared to Zoho Desk. If your SalesIQ plan does not expose ticket endpoints:

1. Replace the `SalesIQTicketingService` base URL with the Zoho Desk API URL (e.g., `https://desk.zoho.com`).
2. Update the path format from `/api/v2/{appId}/tickets` to `/api/v1/tickets`.
3. Update the authentication header format if Zoho Desk uses a different OAuth scope.
4. The custom field names (`cf_conversation_id`, etc.) must be created manually in Zoho Desk under Setup > Layouts and Fields.

### OAuth Token Refresh Not Implemented

The current implementation uses a static `SALESIQ_ACCESS_TOKEN`. Zoho OAuth tokens typically expire after 1 hour. Options for production:

- **External refresh**: Use a sidecar process or cron job that refreshes the token and updates the environment variable or a shared secret store.
- **Implement refresh in-code**: Add a token refresh method to `SalesIQOutboundAdapter` that uses the refresh token and client credentials. The Zoho OAuth token endpoint is `https://accounts.zoho.com/oauth/v2/token`.
- **Long-lived token**: Some Zoho configurations support non-expiring server-to-server tokens. Check your Zoho API console settings.

### Webhook Signature Format Assumed to be HMAC-SHA256

The `verifyWebhookSignature()` function in `src/security/webhook-verifier.ts` assumes:

- The signature is a hex-encoded HMAC-SHA256 digest.
- The signature is sent in the `X-Zoho-Signature` header.
- The signature is computed over the raw request body (not a subset of fields).

If SalesIQ uses a different signing mechanism (e.g., SHA-1, Base64 encoding, or a different header name), update `webhook-verifier.ts` accordingly.

### Conversation-to-Ticket Index is In-Memory

The `SalesIQTicketingService.conversationTicketMap` is a `Map` stored in process memory. This means:

- Ticket lookups by conversation ID are lost on server restart.
- Multi-instance deployments will have inconsistent state.
- In production, replace with a Redis-backed lookup or query the ticket API with a custom field filter.

### Attachment Handling is Passthrough

Attachments from inbound messages are parsed and stored in the `InboundMessage` but are not re-uploaded or forwarded to tickets. To attach files to tickets, implement a file download and re-upload step using the Zoho Desk Attachments API.

### No Retry Logic on Outbound Failures

Outbound API calls do not implement automatic retries. If a `sendMessage` or `updateTicket` call fails:

- The error is logged.
- The Orchestrator continues processing (errors are caught, not re-thrown for ticket updates).
- The visitor does not receive the bot's response if `sendMessage` fails.

Consider adding exponential backoff retry logic for production reliability.
