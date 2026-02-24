# Zobot Configuration Reference

Complete configuration documentation for the Zobot enterprise chatbot platform. This guide covers every environment variable, tenant configuration option, feature flag, tool registration, prompt versioning, knowledge base format, and administrative API.

---

## Table of Contents

1. [Environment Variables](#1-environment-variables)
2. [Tenant Configuration](#2-tenant-configuration)
3. [Feature Flags](#3-feature-flags)
4. [Tool Registry](#4-tool-registry)
5. [Prompt Versioning](#5-prompt-versioning)
6. [Knowledge Base](#6-knowledge-base)
7. [Admin API](#7-admin-api)
8. [Examples](#8-examples)

---

## 1. Environment Variables

All environment variables are defined in `.env.example` and loaded by `src/config/env.ts` at startup using `dotenv`. Variables marked **required** cause the process to throw an `Error` immediately if missing.

### 1.1 Core

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `NODE_ENV` | `string` | `development` | No | Runtime environment. Accepted values: `development`, `test`, `production`. Controls log verbosity, error detail exposure, and internal `isDev` / `isProd` convenience getters. |
| `PORT` | `integer` | `3000` | No | TCP port the Fastify HTTP server listens on. |
| `LOG_LEVEL` | `string` | `info` | No | Pino log level. Accepted values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. |

### 1.2 OpenAI

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `OPENAI_API_KEY` | `string` | -- | **Yes** | OpenAI API key used for all LLM calls. Must start with `sk-`. The process will not start without this value. |
| `OPENAI_MODEL` | `string` | `gpt-5.2` | No | Model identifier sent in the `model` field of every chat completion request. |
| `OPENAI_MAX_TOKENS` | `integer` | `2048` | No | Maximum tokens the model may generate in a single response. |
| `OPENAI_TEMPERATURE` | `float` | `0.3` | No | Sampling temperature. Lower values produce more deterministic output; higher values increase creativity. Parsed with `parseFloat`. |
| `OPENAI_TIMEOUT_MS` | `integer` | `30000` | No | HTTP request timeout in milliseconds for OpenAI API calls. Requests that exceed this duration are aborted. |

### 1.3 Redis

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `REDIS_URL` | `string` | `redis://localhost:6379` | No | Full Redis connection URL. Supports `redis://`, `rediss://` (TLS), and Sentinel URLs. Used for conversation memory, rate-limit counters, and session state. |
| `REDIS_KEY_PREFIX` | `string` | `zobot:` | No | Prefix prepended to every Redis key. Use this to namespace keys when multiple environments share a Redis instance (e.g., `zobot:staging:`). |

### 1.4 Zoho SalesIQ

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SALESIQ_BASE_URL` | `string` | `https://salesiq.zoho.com` | No | Base URL for the Zoho SalesIQ REST API. Override for regional data centers (e.g., `https://salesiq.zoho.eu`, `https://salesiq.zoho.in`). |
| `SALESIQ_APP_ID` | `string` | `""` | No | SalesIQ application ID. Found in Settings > Developers > API in the SalesIQ dashboard. Required for production channel integration. |
| `SALESIQ_ACCESS_TOKEN` | `string` | `""` | No | OAuth 2.0 access token for SalesIQ API authentication. Must have `SalesIQ.chatbots.ALL` scope. Required for production channel integration. |
| `SALESIQ_WEBHOOK_SECRET` | `string` | `""` | No | HMAC secret used to verify the authenticity of inbound webhook payloads from SalesIQ. Required for production webhook validation. |
| `SALESIQ_SCREEN_NAME` | `string` | `zobot` | No | Display name shown to visitors when the bot sends a message in the SalesIQ widget. |

### 1.5 Security

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ADMIN_API_KEY` | `string` | -- | **Yes** | Shared secret for authenticating Admin API requests. Passed via the `X-Admin-Api-Key` HTTP header. **Must be changed from the default in production.** The process will not start without this value. |
| `RATE_LIMIT_PER_VISITOR` | `integer` | `30` | No | Maximum number of messages a single visitor may send within the rate-limit window. Exceeding this limit returns HTTP 429. |
| `RATE_LIMIT_WINDOW_SECONDS` | `integer` | `60` | No | Duration of the sliding rate-limit window in seconds. Counters reset after this period elapses. |
| `RATE_LIMIT_PER_TENANT` | `integer` | `300` | No | Maximum total messages across all visitors for a single tenant within the rate-limit window. Prevents runaway tenants from exhausting shared resources. |

### 1.6 Observability

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ENABLE_METRICS` | `boolean` | `true` | No | Enable Prometheus-compatible metrics export (tool call durations, escalation counters, etc.). Accepts `true`, `1`, `false`, `0`. |
| `ENABLE_TRANSCRIPTS` | `boolean` | `false` | No | Enable full conversation transcript logging. When enabled, every conversation turn is persisted. **Must set `TRANSCRIPT_ENCRYPTION_KEY` when this is `true` in production.** |
| `TRANSCRIPT_ENCRYPTION_KEY` | `string` | `""` | No | AES-256 encryption key for transcript data at rest. Required when `ENABLE_TRANSCRIPTS=true` in production. Leave empty to disable encryption (development only). |

### 1.7 Knowledge / RAG

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `RAG_ENABLED` | `boolean` | `false` | No | Enable Retrieval-Augmented Generation. When `true`, the knowledge service performs vector similarity search instead of keyword matching. Requires an embedding model endpoint. |
| `RAG_EMBEDDING_MODEL` | `string` | `text-embedding-3-small` | No | OpenAI embedding model used for vectorizing knowledge base entries and query text. Only used when `RAG_ENABLED=true`. |
| `RAG_TOP_K` | `integer` | `5` | No | Number of top knowledge results to inject into the LLM context window. Higher values provide more context but consume more tokens. |

### 1.8 Tenant

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DEFAULT_TENANT_ID` | `string` | `default` | No | Tenant ID used when an inbound message does not specify a tenant. Maps to `config/tenants/{DEFAULT_TENANT_ID}.json`. |

---

## 2. Tenant Configuration

Each tenant is configured by a JSON file at `config/tenants/{tenantId}.json`. The `ConfigService` loads all `.json` files from this directory at startup and re-reads them on admin reload. If no file exists for a requested tenant, the built-in default configuration is used as a fallback.

**TypeScript interface** (defined in `src/config/types.ts`):

```typescript
interface TenantConfig {
  tenantId: string;
  enabledTools: string[];
  channelPolicies: Record<Channel, ChannelPolicy>;
  escalationThresholds: EscalationThresholds;
  ticketCreationPolicy: {
    autoCreateOnNew: boolean;
    autoSummarizeOnUpdate: boolean;
    tagPrefix: string;
  };
  promptVersion: string;
  featureFlags: Record<string, boolean>;
}
```

Supported channel identifiers (`Channel` type): `"whatsapp"`, `"business_chat"`, `"web"`.

### 2.1 `enabledTools`

A global allowlist of tool names that this tenant may use. A tool must appear in this array AND in the relevant channel's `enabledTools` array AND have its feature flag set to `true` (or not explicitly `false`) to be executable.

```json
{
  "enabledTools": [
    "get_product_info",
    "create_lead",
    "update_lead",
    "create_ticket_note",
    "schedule_meeting",
    "handoff_to_human"
  ]
}
```

### 2.2 `channelPolicies`

Per-channel overrides that control which tools are available, escalation behavior, and streaming support for each channel.

```typescript
interface ChannelPolicy {
  enabledTools: string[];           // tools available on this channel
  maxTurnsBeforeEscalation: number; // auto-escalate after N turns
  streamingEnabled: boolean;        // enable SSE streaming responses
}
```

Example:

```json
{
  "channelPolicies": {
    "whatsapp": {
      "enabledTools": ["get_product_info", "create_lead", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "business_chat": {
      "enabledTools": ["get_product_info", "create_lead", "update_lead", "create_ticket_note", "schedule_meeting", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "web": {
      "enabledTools": ["get_product_info", "create_lead", "update_lead", "create_ticket_note", "schedule_meeting", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 15,
      "streamingEnabled": true
    }
  }
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| `enabledTools` | `string[]` | Channel-specific tool allowlist. A tool must appear in both the global `enabledTools` and this list to be available on the channel. |
| `maxTurnsBeforeEscalation` | `integer` | If the conversation reaches this many turns without resolution, the orchestrator triggers an automatic escalation to a human agent. |
| `streamingEnabled` | `boolean` | When `true`, responses are streamed to the client via Server-Sent Events. Typically `false` for WhatsApp (which does not support streaming) and `true` for web widgets. |

### 2.3 `escalationThresholds`

Controls when the bot automatically escalates a conversation to a human agent.

```typescript
interface EscalationThresholds {
  maxClarifications: number;
  frustrationKeywords: string[];
  escalationIntents: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `maxClarifications` | `integer` | Maximum number of consecutive clarification questions the bot will ask before escalating. Prevents the visitor from being stuck in a loop. |
| `frustrationKeywords` | `string[]` | If any of these keywords or phrases appear in a visitor message, the bot escalates immediately. Case-insensitive matching. |
| `escalationIntents` | `string[]` | Intent classifications that trigger immediate escalation. The LLM classifies each message with an intent; if it matches any value in this list, the conversation is handed off. |

Default frustration keywords:

```json
["frustrated", "angry", "useless", "terrible", "worst",
 "speak to human", "real person", "manager", "supervisor"]
```

Default escalation intents:

```json
["request_human", "legal_question", "contract_negotiation",
 "discount_request", "complaint"]
```

### 2.4 `ticketCreationPolicy`

Controls automatic Zoho Desk ticket creation and updates.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoCreateOnNew` | `boolean` | `true` | Automatically create a Zoho Desk ticket when a new conversation starts. |
| `autoSummarizeOnUpdate` | `boolean` | `true` | Generate an AI summary and append it to the ticket on each state change. |
| `tagPrefix` | `string` | `"zobot"` | Prefix prepended to all auto-generated ticket tags (e.g., `zobot:lead`, `zobot:support`). Useful for filtering tickets created by the bot. |

### 2.5 `promptVersion`

Selects which prompt bundle to use from `prompts/versions.json`. Must reference a key that exists in the `versions` object and has `"approved": true`.

```json
{
  "promptVersion": "v1"
}
```

### 2.6 `featureFlags`

A flat key-value map of boolean flags used for runtime feature toggling. The most common pattern is `tool.{name}` to enable or disable individual tools without modifying the `enabledTools` arrays.

```json
{
  "featureFlags": {
    "tool.get_product_info": true,
    "tool.create_lead": true,
    "tool.update_lead": true,
    "tool.create_ticket_note": true,
    "tool.schedule_meeting": true,
    "tool.handoff_to_human": true,
    "rag.enabled": false
  }
}
```

---

## 3. Feature Flags

Feature flags provide a runtime kill-switch for any capability without redeploying or editing `enabledTools` arrays.

### 3.1 How Tool Resolution Works

The `ConfigService.isToolEnabled(tenantId, toolName, channel)` method evaluates three conditions. **All three must be true** for a tool to be callable:

```
1. Global allowlist:     enabledTools.includes(toolName)
2. Channel allowlist:    channelPolicies[channel].enabledTools.includes(toolName)
3. Feature flag:         featureFlags["tool.{toolName}"] !== false
```

Note the asymmetry in condition 3: a flag defaults to `true` if the key is not present. Setting it explicitly to `false` disables the tool.

### 3.2 Flag Naming Conventions

| Pattern | Purpose | Example |
|---------|---------|---------|
| `tool.{name}` | Enable/disable a specific tool | `"tool.schedule_meeting": false` |
| `rag.enabled` | Toggle RAG-based knowledge retrieval | `"rag.enabled": true` |

### 3.3 Disabling a Tool at Runtime

To disable `schedule_meeting` for tenant `acme` without touching the `enabledTools` arrays:

```json
{
  "featureFlags": {
    "tool.schedule_meeting": false
  }
}
```

After editing the file, call `POST /admin/reload-config` to apply the change without restarting the process.

### 3.4 Enabling a Tool for a Specific Tenant

To enable RAG for a single tenant while it remains disabled globally via the environment variable:

```json
{
  "featureFlags": {
    "rag.enabled": true
  }
}
```

---

## 4. Tool Registry

Tools are self-contained, schema-validated functions that the LLM can invoke during a conversation. They are managed by the `ToolRegistry` singleton (`src/tools/registry.ts`) and executed by the `ToolRuntime` (`src/tools/runtime.ts`).

### 4.1 ToolDefinition Schema

Every tool must conform to the `ToolDefinition` interface defined in `src/tools/types.ts`:

```typescript
interface ToolDefinition {
  name: string;                           // Unique identifier (snake_case)
  version: string;                        // Semver string (e.g., "1.0.0")
  description: string;                    // Human-readable; sent to the LLM
  inputSchema: Record<string, unknown>;   // JSON Schema for argument validation
  outputSchema: Record<string, unknown>;  // JSON Schema documenting return shape
  authLevel: 'none' | 'service' | 'tenant'; // Required auth level
  rateLimitPerMinute: number;             // Max invocations per minute per tenant
  allowedChannels: Channel[];             // Channels this tool may run on
  featureFlagKey: string;                 // Key checked in tenant featureFlags
  handler: ToolHandler;                   // Async function implementing the tool
}
```

### 4.2 Built-in Tools

| Tool Name | Version | Auth Level | Rate Limit | Description |
|-----------|---------|------------|------------|-------------|
| `get_product_info` | 1.0.0 | `none` | 30/min | Search and retrieve product information from the knowledge base. |
| `create_lead` | 1.0.0 | `service` | 10/min | Create a new lead/contact record with visitor information. |
| `update_lead` | 1.0.0 | `service` | 10/min | Update an existing lead record with new information. |
| `create_ticket_note` | 1.0.0 | `service` | 20/min | Add a note to an existing Zoho Desk ticket. |
| `schedule_meeting` | 1.0.0 | `service` | 5/min | Schedule a meeting between the visitor and a sales representative. |
| `handoff_to_human` | 1.0.0 | `none` | 5/min | Escalate the conversation to a human agent with context summary. |

### 4.3 Tool Execution Governance

The `ToolRuntime.execute()` method enforces the following checks in order:

1. **Registry lookup** -- Verify the tool exists in the registry.
2. **Tenant + channel allowlist** -- Call `configService.isToolEnabled()` (global list, channel list, feature flag).
3. **Channel allowed on tool definition** -- Verify the channel is in the tool's `allowedChannels`.
4. **Rate limiting** -- Per-tool, per-tenant sliding window counter (resets every 60 seconds).
5. **Schema validation** -- Validate arguments against the tool's `inputSchema` using Ajv.
6. **Timeout enforcement** -- Tool handler must resolve within 15 seconds or the call is aborted.
7. **Structured logging** -- Every call (success or failure) is logged with PII-redacted arguments, duration, and result status.

### 4.4 How to Add a New Tool

**Step 1: Create the implementation file.**

Create `src/tools/implementations/{tool-name}.ts`:

```typescript
import { ToolDefinition, ToolHandler } from '../types';

const handler: ToolHandler = async (args, ctx) => {
  // Implementation here
  return {
    success: true,
    data: { /* structured result */ },
  };
};

export const myNewTool: ToolDefinition = {
  name: 'my_new_tool',
  version: '1.0.0',
  description: 'What the LLM should know about when to call this tool.',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description of param1' },
    },
    required: ['param1'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: { type: 'string' },
    },
  },
  authLevel: 'service',
  rateLimitPerMinute: 10,
  allowedChannels: ['whatsapp', 'business_chat', 'web'],
  featureFlagKey: 'tool.my_new_tool',
  handler,
};
```

**Step 2: Register the tool.**

Edit `src/tools/registry.ts` to import and register the new tool:

```typescript
import { myNewTool } from './implementations/my-new-tool';

export function registerBuiltinTools(): void {
  // ... existing registrations ...
  toolRegistry.register(myNewTool);
}
```

**Step 3: Add to tenant configurations.**

Add `"my_new_tool"` to the `enabledTools` array and relevant channel `enabledTools` arrays in each tenant configuration file where the tool should be available:

```json
{
  "enabledTools": ["get_product_info", "create_lead", "my_new_tool"],
  "channelPolicies": {
    "web": {
      "enabledTools": ["get_product_info", "create_lead", "my_new_tool"]
    }
  },
  "featureFlags": {
    "tool.my_new_tool": true
  }
}
```

**Step 4: Reload configuration.**

```bash
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: your-admin-key"
```

Note: Adding a new tool implementation requires a process restart since the code must be compiled and loaded. The reload endpoint only refreshes JSON/YAML configuration data.

---

## 5. Prompt Versioning

Prompt bundles are versioned to provide a controlled rollout process with approval tracking. The system is managed by the `promptManager` service and driven by `prompts/versions.json`.

### 5.1 Directory Structure

```
prompts/
  versions.json       # Version registry and approval metadata
  system.md           # System prompt (role, boundaries, behavior rules)
  developer.md        # Developer/internal instructions for the LLM
  brand_tone.md       # Brand voice and tone guidelines
```

### 5.2 `versions.json` Schema

```json
{
  "default": "v1",
  "versions": {
    "v1": {
      "system": "system.md",
      "developer": "developer.md",
      "brandTone": "brand_tone.md",
      "approved": true,
      "approvedBy": "admin@company.com",
      "approvedAt": "2025-01-15T00:00:00Z"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `default` | `string` | The version key used when a tenant's `promptVersion` is not explicitly set or references a nonexistent version. |
| `versions` | `object` | Map of version keys to version metadata objects. |
| `versions.{key}.system` | `string` | Filename (relative to `prompts/`) of the system prompt. |
| `versions.{key}.developer` | `string` | Filename of the developer prompt. |
| `versions.{key}.brandTone` | `string` | Filename of the brand tone prompt. |
| `versions.{key}.approved` | `boolean` | Whether this version has been approved for production use. Only approved versions should be referenced by tenant configs. |
| `versions.{key}.approvedBy` | `string` | Email or identifier of the person who approved the version. |
| `versions.{key}.approvedAt` | `string` | ISO 8601 timestamp of the approval. |

### 5.3 Approval Workflow

1. **Draft:** Create new prompt files (e.g., `system_v2.md`, `developer_v2.md`, `brand_tone_v2.md`).
2. **Register:** Add a new entry to `versions.json` with `"approved": false`.
3. **Test:** Point a staging tenant's `promptVersion` to the new version key and validate behavior.
4. **Approve:** Set `"approved": true`, fill in `approvedBy` and `approvedAt`.
5. **Rollout:** Update production tenant configs to reference the new `promptVersion`.
6. **Reload:** Call `POST /admin/reload-config` to pick up the changes.

### 5.4 Adding a New Version

```json
{
  "default": "v1",
  "versions": {
    "v1": {
      "system": "system.md",
      "developer": "developer.md",
      "brandTone": "brand_tone.md",
      "approved": true,
      "approvedBy": "admin@company.com",
      "approvedAt": "2025-01-15T00:00:00Z"
    },
    "v2": {
      "system": "system_v2.md",
      "developer": "developer_v2.md",
      "brandTone": "brand_tone_v2.md",
      "approved": false,
      "approvedBy": "",
      "approvedAt": ""
    }
  }
}
```

---

## 6. Knowledge Base

The knowledge base consists of three YAML files in the `knowledge/` directory. These are loaded at startup by `KnowledgeService` (`src/knowledge/knowledge-service.ts`) and re-read on admin reload. The service provides keyword-based search out of the box; when `RAG_ENABLED=true`, vector similarity search replaces the keyword matcher.

### 6.1 `faq.yaml`

Frequently asked questions. Used for common visitor queries.

**Schema per entry:**

```yaml
- question: "string"     # The question as a visitor might ask it
  answer: "string"       # The full answer text
  tags: [string, ...]    # Keywords for search indexing
  category: "string"     # Grouping category (e.g., general, billing, account, technical)
```

**TypeScript type** (`src/knowledge/types.ts`):

```typescript
interface FAQEntry {
  question: string;
  answer: string;
  tags: string[];
  category: string;
}
```

**Example:**

```yaml
- question: "What are your business hours?"
  answer: "Our team is available Monday through Friday, 9 AM to 6 PM (EST)."
  tags: [hours, schedule, availability]
  category: general

- question: "How do I reset my password?"
  answer: "Go to the login page and click 'Forgot Password'..."
  tags: [password, reset, login, account]
  category: account
```

### 6.2 `products.yaml`

Product and plan information surfaced by the `get_product_info` tool.

**Schema per entry:**

```yaml
- id: "string"            # Unique product/plan identifier
  name: "string"          # Display name
  description: "string"   # Full product description
  features:               # List of feature descriptions
    - "string"
  pricing: "string"       # Pricing information (optional)
  category: "string"      # Grouping (e.g., plans, modules, add-ons)
```

**TypeScript type:**

```typescript
interface ProductEntry {
  id: string;
  name: string;
  description: string;
  features: string[];
  pricing?: string;
  category: string;
}
```

**Example:**

```yaml
- id: professional
  name: "Professional Plan"
  description: "Designed for growing businesses that need advanced features."
  features:
    - "Up to 50 team members"
    - "Unlimited contacts"
    - "API access"
  pricing: "$79/month per user"
  category: plans
```

### 6.3 `policies.yaml`

Legal policies, SLAs, and operational guidelines.

**Schema per entry:**

```yaml
- id: "string"          # Unique policy identifier
  title: "string"       # Policy title
  content: "string"     # Full policy text
  category: "string"    # Grouping (e.g., legal, operations, security)
```

**TypeScript type:**

```typescript
interface PolicyEntry {
  id: string;
  title: string;
  content: string;
  category: string;
}
```

**Example:**

```yaml
- id: sla
  title: "Service Level Agreement"
  content: "We guarantee 99.9% uptime for Professional plans..."
  category: operations
```

### 6.4 Search Behavior

The default search implementation (`KnowledgeService.search()`) performs keyword matching:

1. The query is tokenized into lowercase terms.
2. Each knowledge entry is scored by the fraction of query terms found in the entry's combined text fields.
3. Entries with a score above 0.2 are returned, sorted by score descending, limited to `RAG_TOP_K` results.

When `RAG_ENABLED=true`, replace this with a vector similarity search backed by embeddings from the `RAG_EMBEDDING_MODEL`.

---

## 7. Admin API

The Admin API provides operational endpoints for runtime configuration management. All endpoints require the `X-Admin-Api-Key` header matching the `ADMIN_API_KEY` environment variable.

Routes are registered by `src/admin/admin-routes.ts`.

### 7.1 `POST /admin/reload-config`

Reload all configuration sources without restarting the process. This re-reads:

- **Tenant configurations** -- All `config/tenants/*.json` files
- **Prompt bundles** -- `prompts/versions.json` and referenced markdown files
- **Knowledge base** -- `knowledge/*.yaml` files

**Request:**

```http
POST /admin/reload-config HTTP/1.1
Host: localhost:3000
X-Admin-Api-Key: your-admin-api-key
```

**Response (200):**

```json
{
  "status": "ok",
  "message": "All configurations reloaded"
}
```

**Response (403) -- invalid or missing API key:**

```json
{
  "error": "Forbidden"
}
```

**Response (500) -- reload failure:**

```json
{
  "error": "Reload failed"
}
```

### 7.2 `GET /admin/config/:tenantId`

Retrieve the current configuration for a tenant. The response is **redacted** -- it includes structural configuration but omits sensitive fields such as `ticketCreationPolicy`.

**Request:**

```http
GET /admin/config/default HTTP/1.1
Host: localhost:3000
X-Admin-Api-Key: your-admin-api-key
```

**Response (200):**

```json
{
  "tenantId": "default",
  "enabledTools": [
    "get_product_info",
    "create_lead",
    "update_lead",
    "create_ticket_note",
    "schedule_meeting",
    "handoff_to_human"
  ],
  "channelPolicies": {
    "whatsapp": {
      "enabledTools": ["get_product_info", "create_lead", "update_lead", "create_ticket_note", "schedule_meeting", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "business_chat": {
      "enabledTools": ["get_product_info", "create_lead", "update_lead", "create_ticket_note", "schedule_meeting", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "web": {
      "enabledTools": ["get_product_info", "create_lead", "update_lead", "create_ticket_note", "schedule_meeting", "handoff_to_human"],
      "maxTurnsBeforeEscalation": 15,
      "streamingEnabled": true
    }
  },
  "escalationThresholds": {
    "maxClarifications": 2,
    "frustrationKeywords": ["frustrated", "angry", "useless", "terrible", "worst", "speak to human", "real person", "manager", "supervisor"],
    "escalationIntents": ["request_human", "legal_question", "contract_negotiation", "discount_request", "complaint"]
  },
  "promptVersion": "v1",
  "featureFlags": {
    "tool.get_product_info": true,
    "tool.create_lead": true,
    "tool.update_lead": true,
    "tool.create_ticket_note": true,
    "tool.schedule_meeting": true,
    "tool.handoff_to_human": true,
    "rag.enabled": false
  }
}
```

**Response (403):**

```json
{
  "error": "Forbidden"
}
```

If the requested tenant does not have a dedicated config file, the built-in default configuration is returned.

---

## 8. Examples

### 8.1 Disable a Tool for WhatsApp Only

**Goal:** Disable `schedule_meeting` on WhatsApp for tenant `default` while keeping it available on `web` and `business_chat`.

**Edit** `config/tenants/default.json`:

Remove `"schedule_meeting"` from the WhatsApp channel policy only. The global `enabledTools` and other channel policies remain unchanged.

```json
{
  "tenantId": "default",
  "enabledTools": [
    "get_product_info",
    "create_lead",
    "update_lead",
    "create_ticket_note",
    "schedule_meeting",
    "handoff_to_human"
  ],
  "channelPolicies": {
    "whatsapp": {
      "enabledTools": [
        "get_product_info",
        "create_lead",
        "update_lead",
        "create_ticket_note",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "business_chat": {
      "enabledTools": [
        "get_product_info",
        "create_lead",
        "update_lead",
        "create_ticket_note",
        "schedule_meeting",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 10,
      "streamingEnabled": false
    },
    "web": {
      "enabledTools": [
        "get_product_info",
        "create_lead",
        "update_lead",
        "create_ticket_note",
        "schedule_meeting",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 15,
      "streamingEnabled": true
    }
  }
}
```

**Apply the change without restart:**

```bash
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: your-admin-key"
```

**Why this works:** `ConfigService.isToolEnabled()` checks both the global `enabledTools` (which still includes `schedule_meeting`) and the channel-specific `enabledTools` (which no longer includes it for WhatsApp). The intersection check prevents the tool from executing on WhatsApp while leaving it available elsewhere.

### 8.2 Add a New Tenant with Restricted Tools

**Goal:** Onboard a new tenant `acme-corp` that should only have access to `get_product_info` and `handoff_to_human`. Disable lead creation, ticket notes, meeting scheduling, and lead updates. Use prompt version `v1`. Set a lower escalation turn limit for faster human handoff.

**Step 1:** Create `config/tenants/acme-corp.json`:

```json
{
  "tenantId": "acme-corp",
  "enabledTools": [
    "get_product_info",
    "handoff_to_human"
  ],
  "channelPolicies": {
    "whatsapp": {
      "enabledTools": [
        "get_product_info",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 5,
      "streamingEnabled": false
    },
    "business_chat": {
      "enabledTools": [
        "get_product_info",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 5,
      "streamingEnabled": false
    },
    "web": {
      "enabledTools": [
        "get_product_info",
        "handoff_to_human"
      ],
      "maxTurnsBeforeEscalation": 8,
      "streamingEnabled": true
    }
  },
  "escalationThresholds": {
    "maxClarifications": 1,
    "frustrationKeywords": [
      "frustrated", "angry", "useless", "terrible", "worst",
      "speak to human", "real person", "manager", "supervisor"
    ],
    "escalationIntents": [
      "request_human", "legal_question", "contract_negotiation",
      "discount_request", "complaint"
    ]
  },
  "ticketCreationPolicy": {
    "autoCreateOnNew": true,
    "autoSummarizeOnUpdate": false,
    "tagPrefix": "acme"
  },
  "promptVersion": "v1",
  "featureFlags": {
    "tool.get_product_info": true,
    "tool.create_lead": false,
    "tool.update_lead": false,
    "tool.create_ticket_note": false,
    "tool.schedule_meeting": false,
    "tool.handoff_to_human": true,
    "rag.enabled": false
  }
}
```

**Step 2:** Reload configuration:

```bash
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: your-admin-key"
```

**Step 3:** Verify the configuration was loaded:

```bash
curl http://localhost:3000/admin/config/acme-corp \
  -H "X-Admin-Api-Key: your-admin-key"
```

**Defense in depth:** Even if the `enabledTools` arrays were misconfigured, the feature flags `"tool.create_lead": false` etc. act as a second gate. The `isToolEnabled()` method requires all three layers (global list, channel list, feature flag) to pass before permitting execution.

---

## Appendix: Quick Reference

### Configuration File Locations

| File | Purpose |
|------|---------|
| `.env` | Environment variables (copied from `.env.example`) |
| `config/tenants/{tenantId}.json` | Per-tenant configuration |
| `prompts/versions.json` | Prompt version registry |
| `prompts/*.md` | Prompt template files |
| `knowledge/faq.yaml` | FAQ entries |
| `knowledge/products.yaml` | Product catalog |
| `knowledge/policies.yaml` | Policy documents |

### Required Environment Variables Checklist

Before starting the server, verify these are set:

- [x] `OPENAI_API_KEY` -- valid OpenAI API key
- [x] `ADMIN_API_KEY` -- changed from default value

### Tool Enable/Disable Decision Tree

```
Is tool in tenant.enabledTools[]?
  No  --> BLOCKED
  Yes --> Is tool in channelPolicies[channel].enabledTools[]?
            No  --> BLOCKED
            Yes --> Is featureFlags["tool.{name}"] === false?
                      Yes --> BLOCKED
                      No  --> Is channel in tool.allowedChannels[]?
                                No  --> BLOCKED
                                Yes --> Is rate limit exceeded?
                                          Yes --> BLOCKED (429)
                                          No  --> EXECUTE
```
