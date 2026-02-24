# Zobot Operations Manual

> Production operations documentation for the Zobot enterprise AI chatbot platform.
> Stack: Node.js 20 / TypeScript, Fastify 5, Redis 7, OpenAI gpt-5.2, Zoho SalesIQ.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [Runbooks](#3-runbooks)
   - [3.1 Deploying a New Version](#31-deploying-a-new-version)
   - [3.2 Rolling Back a Deployment](#32-rolling-back-a-deployment)
   - [3.3 Reloading Configuration Without Redeployment](#33-reloading-configuration-without-redeployment)
   - [3.4 Handling OpenAI API Outages](#34-handling-openai-api-outages)
   - [3.5 Redis Connection Loss](#35-redis-connection-loss)
   - [3.6 High Error Rate Triage](#36-high-error-rate-triage)
4. [On-Call Notes](#4-on-call-notes)
   - [4.1 Key Endpoints](#41-key-endpoints)
   - [4.2 Common Failure Modes and Quick Fixes](#42-common-failure-modes-and-quick-fixes)
   - [4.3 Escalation Contacts](#43-escalation-contacts)
5. [Dashboards (Grafana)](#5-dashboards-grafana)
6. [Alerts](#6-alerts)
7. [Log Analysis](#7-log-analysis)
8. [Transcript Storage](#8-transcript-storage)

---

## 1. Architecture Overview

```
                        +-------------------+
                        |   Zoho SalesIQ    |
                        |   (Widget/Chat)   |
                        +---------+---------+
                                  |
                           Webhook POST
                      x-zoho-signature verified
                                  |
                                  v
                   +--------------+---------------+
                   |        Fastify Server         |
                   |        (port 3000)            |
                   |                               |
                   |  POST /webhooks/salesiq       |
                   |  GET  /health                 |
                   |  GET  /ready                  |
                   |  GET  /metrics                |
                   |  POST /admin/reload-config    |
                   |  GET  /admin/config/:tenantId |
                   +-+----------+----------+------+
                     |          |          |
            +--------+   +-----+-----+   ++----------+
            | Rate    |   | Abuse     |   | Webhook   |
            | Limiter |   | Detector  |   | Verifier  |
            +--------+   +-----------+   +-----------+
                     |
                     v
              +------+------+
              | Orchestrator |
              +--+--+--+--+-+
                 |  |  |  |
     +-----------+  |  |  +------------+
     v              v  v               v
 +---+----+   +----+--+----+   +------+------+
 | State   |   | Agent Core |   | Tool        |
 | Machine |   | (OpenAI)   |   | Runtime     |
 +---------+   +-----+------+   +---+---------+
                     |               |
               +-----+------+   +---+---+---+---+---+
               | Prompt Mgr  |   | Tools:            |
               | Knowledge   |   | - get_product_info|
               | Service     |   | - create_lead     |
               +-----------+    | - update_lead     |
                                | - create_ticket   |
                                | - schedule_meeting|
                                | - handoff_to_human|
                                +-------------------+
                     |
                     v
               +-----+------+       +--------+
               | Conversation| <---> | Redis  |
               | Memory      |       | 7      |
               +-------------+       +--------+
```

**Key behavioral characteristics:**

- Webhook requests return `200 Accepted` immediately; orchestrator processing runs asynchronously.
- The circuit breaker on OpenAI activates after **5 consecutive failures** and resets after **60 seconds**.
- Redis is optional at startup; the system falls back to an in-memory conversation store if Redis is unreachable.
- Conversations expire from Redis after **24 hours** (TTL). Each conversation retains a maximum of **20 turns**.
- Tool executions enforce a **15-second timeout** and per-tool rate limiting.
- PII (email, phone, SSN, credit card numbers) is automatically redacted from all log output.

---

## 2. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `PORT` | No | `3000` | HTTP listen port |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `OPENAI_API_KEY` | **Yes** | -- | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-5.2` | Model identifier |
| `OPENAI_MAX_TOKENS` | No | `2048` | Max tokens per completion |
| `OPENAI_TEMPERATURE` | No | `0.3` | Sampling temperature |
| `OPENAI_TIMEOUT_MS` | No | `30000` | Per-request timeout in milliseconds |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `REDIS_KEY_PREFIX` | No | `zobot:` | Key namespace prefix |
| `SALESIQ_BASE_URL` | No | `https://salesiq.zoho.com` | SalesIQ API base |
| `SALESIQ_APP_ID` | No | `""` | SalesIQ application ID |
| `SALESIQ_ACCESS_TOKEN` | No | `""` | SalesIQ access token |
| `SALESIQ_WEBHOOK_SECRET` | No | `""` | HMAC secret for webhook signature verification |
| `SALESIQ_SCREEN_NAME` | No | `zobot` | Bot display name in SalesIQ |
| `ADMIN_API_KEY` | **Yes** | -- | API key for `/admin/*` endpoints |
| `RATE_LIMIT_PER_VISITOR` | No | `30` | Max requests per visitor per window |
| `RATE_LIMIT_WINDOW_SECONDS` | No | `60` | Sliding window duration in seconds |
| `RATE_LIMIT_PER_TENANT` | No | `300` | Max requests per tenant per window |
| `ENABLE_METRICS` | No | `true` | Expose `/metrics` Prometheus endpoint |
| `ENABLE_TRANSCRIPTS` | No | `false` | Persist conversation transcripts |
| `TRANSCRIPT_ENCRYPTION_KEY` | No | `""` | AES key for transcript encryption at rest |
| `RAG_ENABLED` | No | `false` | Enable vector-search knowledge retrieval |
| `RAG_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Embedding model |
| `RAG_TOP_K` | No | `5` | Number of retrieved chunks |
| `DEFAULT_TENANT_ID` | No | `default` | Fallback tenant when header is absent |

---

## 3. Runbooks

### 3.1 Deploying a New Version

**Pre-deployment checklist:**

1. All CI checks pass on the `main` branch (lint, build, unit tests, integration tests).
2. The `CHANGELOG` or commit messages describe what changed.
3. Verify the target environment's `.env` file contains any new required variables.

**Procedure (Docker Compose):**

```bash
# 1. Pull latest code
git pull origin main

# 2. Build the new image
docker compose build zobot

# 3. Run the new container (zero-downtime if behind a load balancer)
docker compose up -d zobot

# 4. Verify health
curl -s http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# 5. Verify readiness (checks Redis + OpenAI)
curl -s http://localhost:3000/ready
# Expected: {"status":"ready","checks":{"redis":{"status":"ok",...},"openai":{"status":"ok",...}}}

# 6. Verify metrics are flowing
curl -s http://localhost:3000/metrics | head -20
```

**Procedure (Container Orchestrator / Kubernetes):**

```bash
# 1. Build and push image
docker build -t your-registry/zobot:v1.2.3 .
docker push your-registry/zobot:v1.2.3

# 2. Update deployment image
kubectl set image deployment/zobot zobot=your-registry/zobot:v1.2.3

# 3. Monitor rollout
kubectl rollout status deployment/zobot

# 4. Verify pods are healthy
kubectl get pods -l app=zobot
```

**Post-deployment verification:**

- Confirm `/ready` returns `200` for all pods.
- Check Grafana dashboards for error rate spikes in the first 5 minutes.
- Send a test message through SalesIQ and verify end-to-end flow.
- Monitor `zobot_http_request_duration_seconds` for latency regressions.

---

### 3.2 Rolling Back a Deployment

**Docker Compose:**

```bash
# 1. Identify the previous working image
docker images your-registry/zobot --format "{{.Tag}} {{.CreatedAt}}" | head -5

# 2. Update docker-compose.yml or roll back the code
git checkout <previous-commit>

# 3. Rebuild and restart
docker compose build zobot
docker compose up -d zobot

# 4. Verify
curl -s http://localhost:3000/ready
```

**Kubernetes:**

```bash
# 1. View rollout history
kubectl rollout history deployment/zobot

# 2. Roll back to the previous revision
kubectl rollout undo deployment/zobot

# 3. Or roll back to a specific revision
kubectl rollout undo deployment/zobot --to-revision=<N>

# 4. Monitor
kubectl rollout status deployment/zobot
```

**After rollback:**

- Verify `/ready` returns `200`.
- Investigate the root cause of the failed deployment before attempting re-deployment.
- If configuration changes caused the failure, use the config reload endpoint (section 3.3) instead of a full rollback.

---

### 3.3 Reloading Configuration Without Redeployment

The admin reload endpoint refreshes tenant configs, prompt templates, and knowledge base files from disk without restarting the process. This is useful when you update YAML files in `config/tenants/`, `prompts/`, or `knowledge/`.

**Endpoint:** `POST /admin/reload-config`
**Authentication:** `X-Admin-Api-Key` header (must match `ADMIN_API_KEY` env var)

```bash
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: ${ADMIN_API_KEY}"
```

**Expected success response:**

```json
{
  "status": "ok",
  "message": "All configurations reloaded"
}
```

**Expected failure response (403):**

```json
{
  "error": "Forbidden"
}
```

**Expected failure response (500):**

```json
{
  "error": "Reload failed"
}
```

**What gets reloaded:**

| Component | Source Directory | Effect |
|---|---|---|
| Tenant configurations | `config/tenants/` | Escalation thresholds, channel policies, tool allowlists, prompt version |
| Prompt templates | `prompts/` | System prompt, developer instructions, brand tone |
| Knowledge base | `knowledge/` | FAQ entries, product catalog, policy documents |

**What does NOT get reloaded (requires restart):**

- Environment variables (`OPENAI_API_KEY`, `REDIS_URL`, etc.)
- Rate limiter configuration
- Redis connection parameters
- Server port or TLS settings

**Operational notes:**

- Reload is atomic per component: if prompt loading fails, tenant configs that already loaded remain active.
- Monitor logs for the `Configuration reloaded` info message or `Config reload failed` error.
- In a multi-instance deployment, you must call this endpoint on every instance individually, or automate it via a deployment hook.

**Viewing current tenant configuration (redacted):**

```bash
curl -s http://localhost:3000/admin/config/default \
  -H "X-Admin-Api-Key: ${ADMIN_API_KEY}" | jq .
```

---

### 3.4 Handling OpenAI API Outages

**Circuit breaker behavior (automatic):**

The `AgentCore` class implements a circuit breaker with the following parameters:

| Parameter | Value | Source |
|---|---|---|
| Failure threshold | 5 consecutive failures | `CIRCUIT_BREAKER_THRESHOLD` in `src/agent/agent-core.ts` |
| Reset timeout | 60 seconds | `CIRCUIT_BREAKER_RESET_MS` in `src/agent/agent-core.ts` |
| Retry strategy | 2 automatic retries per request | OpenAI SDK `maxRetries: 2` |
| Request timeout | 30 seconds (configurable) | `OPENAI_TIMEOUT_MS` env var |

**When the circuit breaker opens:**

1. All incoming messages receive a fallback response: *"Our system is temporarily busy. A team member will assist you shortly."*
2. The agent automatically triggers a `handoff_to_human` tool call with reason `"LLM service unavailable"`.
3. Tickets are tagged with `zobot-llm-error` and status set to `Escalated`.
4. A `warn` log is emitted: `Circuit breaker open; returning fallback`.
5. An `error` log is emitted: `Circuit breaker opened` with the failure count.

**When the circuit breaker resets (after 60 seconds):**

1. The next incoming message attempts a real OpenAI call.
2. If the call succeeds, the failure counter resets to zero and normal operation resumes.
3. If the call fails, the failure counter increments and the breaker may re-open.

**Manual intervention steps:**

```bash
# 1. Check if OpenAI is experiencing issues
curl -s https://status.openai.com/api/v2/status.json | jq .

# 2. Verify the /ready endpoint shows OpenAI status
curl -s http://localhost:3000/ready | jq .checks.openai

# 3. Check logs for circuit breaker activity
# Look for: "Circuit breaker opened" or "Circuit breaker open; returning fallback"

# 4. Check metrics for LLM error rate
curl -s http://localhost:3000/metrics | grep zobot_llm_request_duration_seconds

# 5. If OpenAI is back but breaker is still open, wait up to 60 seconds
# for automatic reset, or restart the service to force-reset the breaker.
```

**Extended outage procedure:**

- If the outage exceeds 5 minutes, alert the on-call team.
- All conversations will be escalated to human agents automatically. Ensure adequate staffing on the SalesIQ human agent queue.
- Consider temporarily pausing the SalesIQ chat widget if human agent capacity is insufficient.
- The circuit breaker resets automatically; no manual intervention is needed once OpenAI recovers.

---

### 3.5 Redis Connection Loss

**Startup behavior:**

At application startup, Redis connection is attempted with the following retry strategy:

| Parameter | Value |
|---|---|
| Max retries per request | 3 |
| Retry backoff | `min(attempts * 200ms, 2000ms)` |
| Max reconnect attempts | 5 (then gives up) |
| Connection mode | `lazyConnect: true` |

If Redis is unreachable at startup, the application logs a warning and starts with the **in-memory conversation store** (`InMemoryConversationStore`).

**Impact of Redis loss:**

| Feature | With Redis | Without Redis (in-memory fallback) |
|---|---|---|
| Conversation persistence | Survives restarts, shared across instances | Lost on restart, per-instance only |
| Conversation TTL | 24 hours | Until process exits |
| Multi-instance support | Full support (shared state) | Not supported (each instance has its own state) |
| Turn limit | 20 turns per conversation | 20 turns per conversation |
| `/ready` endpoint | Reports `redis: ok` | Reports `redis: skipped` |

**Detecting Redis connection loss:**

```bash
# 1. Check readiness probe
curl -s http://localhost:3000/ready | jq .checks.redis
# If Redis is down: {"status":"error","latencyMs":...}
# If Redis was never connected: {"status":"skipped"}

# 2. Check logs for Redis errors
# Look for: "Redis not available; using in-memory fallback"
# Look for: "Failed to read conversation from Redis"
# Look for: "Failed to save conversation to Redis"

# 3. Test Redis directly
redis-cli -u "${REDIS_URL}" ping
```

**Recovery procedure:**

1. Fix the Redis instance (restart, resolve network issues, check memory limits).
2. Verify with `redis-cli ping`.
3. Restart the Zobot application to re-establish the Redis connection.
4. Confirm `/ready` shows `redis: ok`.

**Note:** The in-memory store does not automatically reconnect to Redis. A full application restart is required to switch back from in-memory to Redis-backed storage. Active conversations in the in-memory store are lost on restart.

**Redis configuration (from `docker-compose.yml`):**

```
redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

- Append-only file (AOF) enabled for durability.
- 256 MB memory limit with LRU eviction.
- Health check: `redis-cli ping` every 10 seconds with 5 retries.

---

### 3.6 High Error Rate Triage

**Step 1: Determine scope and source**

```bash
# Check overall error rate from metrics
curl -s http://localhost:3000/metrics | grep -E 'status_code="5'

# Check readiness of all dependencies
curl -s http://localhost:3000/ready | jq .

# Examine recent error logs (pipe through jq for structured parsing)
# In production, query your log aggregator for:
#   level: "error" AND service: "zobot" AND timestamp > now-15m
```

**Step 2: Categorize the errors**

| Error Category | Log Indicator | Likely Cause |
|---|---|---|
| LLM failures | `LLM request failed` | OpenAI outage, invalid API key, rate limit |
| Circuit breaker | `Circuit breaker opened` | Sustained OpenAI failures (>= 5) |
| Tool execution | `Tool execution failed` | Downstream API error, timeout |
| Webhook parsing | `Failed to parse webhook` | SalesIQ payload format change |
| Ticket operations | `Failed to create ticket` / `Failed to update ticket` | SalesIQ ticketing API error |
| Outbound messaging | `Failed to send outbound message` | SalesIQ messaging API error |
| Rate limiting | `Rate limit exceeded` / `Tenant rate limit exceeded` | Traffic spike or abuse |
| Signature verification | `Invalid signature` (401 response) | Misconfigured webhook secret |
| Config reload | `Config reload failed` | Malformed YAML in config/prompts/knowledge |

**Step 3: Check metrics for patterns**

```bash
# LLM latency (are requests timing out?)
curl -s http://localhost:3000/metrics | grep zobot_llm_request_duration_seconds

# Tool call errors
curl -s http://localhost:3000/metrics | grep zobot_tool_call_duration_seconds

# Escalation spikes (symptom of upstream failures)
curl -s http://localhost:3000/metrics | grep zobot_escalations_total

# Message throughput (is traffic normal?)
curl -s http://localhost:3000/metrics | grep zobot_messages_processed_total
```

**Step 4: Common resolutions**

| Root Cause | Resolution |
|---|---|
| OpenAI rate limit | Reduce `OPENAI_MAX_TOKENS`, increase `OPENAI_TIMEOUT_MS`, or upgrade OpenAI plan |
| OpenAI outage | Wait for circuit breaker reset (60s); see section 3.4 |
| Redis OOM | Increase `maxmemory` or investigate key accumulation |
| Malformed config | Fix YAML files and call `POST /admin/reload-config` |
| SalesIQ token expiry | Rotate `SALESIQ_ACCESS_TOKEN` and restart |
| Traffic spike / abuse | Check `RATE_LIMIT_PER_VISITOR` and `RATE_LIMIT_PER_TENANT` settings; examine abuse detector logs |
| Tool timeout | Check downstream API health; tool timeout is 15 seconds |

---

## 4. On-Call Notes

### 4.1 Key Endpoints

| Endpoint | Method | Purpose | Auth | Expected Response |
|---|---|---|---|---|
| `/health` | GET | **Liveness probe.** Returns 200 if the process is running. Does not check dependencies. | None | `{"status":"ok","timestamp":"..."}` |
| `/ready` | GET | **Readiness probe.** Checks Redis connectivity (PING) and OpenAI reachability (models.list). Returns 503 if any dependency is down. | None | `{"status":"ready","checks":{"redis":{"status":"ok","latencyMs":N},"openai":{"status":"ok","latencyMs":N}}}` |
| `/metrics` | GET | **Prometheus metrics.** All custom counters, histograms, gauges, plus default Node.js metrics (prefixed `zobot_`). Only available when `ENABLE_METRICS=true`. | None | Prometheus text format |
| `/admin/reload-config` | POST | Hot-reload tenant configs, prompts, and knowledge base from disk. | `X-Admin-Api-Key` header | `{"status":"ok","message":"All configurations reloaded"}` |
| `/admin/config/:tenantId` | GET | View redacted tenant configuration. | `X-Admin-Api-Key` header | Tenant config JSON (secrets redacted) |
| `/webhooks/salesiq` | POST | Inbound message webhook from Zoho SalesIQ. | `X-Zoho-Signature` header (HMAC) | `{"status":"accepted","requestId":"..."}` |

**Quick health check script:**

```bash
#!/bin/bash
HOST="${ZOBOT_HOST:-http://localhost:3000}"

echo "=== Liveness ==="
curl -sf "${HOST}/health" | jq .

echo "=== Readiness ==="
curl -sf "${HOST}/ready" | jq .

echo "=== Active Conversations ==="
curl -sf "${HOST}/metrics" | grep zobot_active_conversations

echo "=== Recent Errors ==="
curl -sf "${HOST}/metrics" | grep 'status="error"'
```

### 4.2 Common Failure Modes and Quick Fixes

#### `/ready` returns 503

```
{"status":"not_ready","checks":{"redis":{"status":"error"},"openai":{"status":"ok"}}}
```

**Quick fix:** Check Redis connectivity. Run `redis-cli -u "${REDIS_URL}" ping`. If Redis is down, the app is still functional with in-memory storage but cannot share state across instances.

---

#### `/ready` returns 503 for OpenAI

```
{"status":"not_ready","checks":{"redis":{"status":"ok"},"openai":{"status":"error"}}}
```

**Quick fix:** Check OpenAI status at https://status.openai.com. Verify `OPENAI_API_KEY` is valid. The circuit breaker will handle this automatically by escalating to human agents.

---

#### 401 on webhook calls

All incoming SalesIQ webhooks return 401.

**Quick fix:** The `SALESIQ_WEBHOOK_SECRET` is incorrect or was rotated in SalesIQ without updating the environment variable. Update the secret and restart.

---

#### 429 responses (rate limiting)

Visitors or tenants hitting rate limits.

**Quick fix:** Check if it is legitimate traffic or abuse. Review abuse detector logs (`Message blocked`). Adjust `RATE_LIMIT_PER_VISITOR` (default: 30/min) or `RATE_LIMIT_PER_TENANT` (default: 300/min) if needed.

---

#### All messages escalating to human agents

Every conversation goes to human handoff.

**Quick fix:** This usually means the circuit breaker is open (OpenAI is unreachable). Check logs for `Circuit breaker open; returning fallback`. Wait 60 seconds for auto-reset or restart the service.

---

#### High LLM latency (p99 > 10 seconds)

**Quick fix:** Check if `OPENAI_MODEL` is correct. Reduce `OPENAI_MAX_TOKENS` from 2048 to 1024 for faster responses. Check OpenAI status page for degraded performance. The per-request timeout is controlled by `OPENAI_TIMEOUT_MS` (default: 30s).

---

#### Conversation history missing after restart

**Quick fix:** This occurs when running with in-memory storage (Redis was unavailable at startup). Restart the application after ensuring Redis is accessible. In-memory conversation data cannot be recovered.

---

#### Config reload returns 500

**Quick fix:** One or more YAML files in `config/tenants/`, `prompts/`, or `knowledge/` have syntax errors. Validate YAML syntax before reloading:

```bash
python3 -c "import yaml; yaml.safe_load(open('config/tenants/default.yaml'))"
# or
npx js-yaml config/tenants/default.yaml
```

---

### 4.3 Escalation Contacts

> **Update this section with your organization's actual contacts before going to production.**

| Role | Name | Contact | When to Escalate |
|---|---|---|---|
| Primary On-Call Engineer | _TBD_ | _TBD_ | Any P1/P2 alert firing |
| Secondary On-Call Engineer | _TBD_ | _TBD_ | Primary unreachable after 15 min |
| Engineering Manager | _TBD_ | _TBD_ | Outage > 30 min, data loss incidents |
| OpenAI Account Contact | _TBD_ | _TBD_ | Sustained API outage, billing issues |
| Zoho SalesIQ Admin | _TBD_ | _TBD_ | Webhook config issues, token rotation |
| DevOps / Infrastructure | _TBD_ | _TBD_ | Redis failures, container orchestration issues |
| Security Team | _TBD_ | _TBD_ | Suspected abuse, webhook signature bypass attempts |

**Escalation timeline:**

| Severity | Definition | Response Target | Escalation |
|---|---|---|---|
| P1 - Critical | Service fully down, all conversations failing | 15 minutes | Immediately page on-call |
| P2 - Major | Partial degradation (e.g., circuit breaker open, Redis down) | 30 minutes | Page on-call if not auto-resolved in 5 min |
| P3 - Minor | Elevated error rate, latency increase | 2 hours | Notify via chat channel |
| P4 - Low | Non-urgent config issues, cosmetic problems | Next business day | Ticket in backlog |

---

## 5. Dashboards (Grafana)

Below are recommended Grafana dashboard panels. All metrics are exposed at the `/metrics` endpoint in Prometheus exposition format. Configure your Prometheus instance to scrape `http://<zobot-host>:3000/metrics`.

### Dashboard: Zobot Overview

#### Panel 1: Request Rate by Channel

**Metric:** `zobot_messages_processed_total`
**Type:** Graph (rate)
**Description:** Messages processed per second, split by channel and tenant.

```promql
# Total message rate
rate(zobot_messages_processed_total[5m])

# By channel
sum by (channel) (rate(zobot_messages_processed_total[5m]))

# By tenant
sum by (tenant) (rate(zobot_messages_processed_total[5m]))
```

---

#### Panel 2: LLM Latency

**Metric:** `zobot_llm_request_duration_seconds`
**Type:** Heatmap or histogram with percentile lines
**Description:** OpenAI API call duration distribution. Watch for p99 exceeding 10 seconds.

```promql
# p50
histogram_quantile(0.50, rate(zobot_llm_request_duration_seconds_bucket[5m]))

# p95
histogram_quantile(0.95, rate(zobot_llm_request_duration_seconds_bucket[5m]))

# p99
histogram_quantile(0.99, rate(zobot_llm_request_duration_seconds_bucket[5m]))

# Error rate
sum(rate(zobot_llm_request_duration_seconds_count{status="error"}[5m]))
/
sum(rate(zobot_llm_request_duration_seconds_count[5m]))
```

**Bucket boundaries:** 0.5s, 1s, 2s, 5s, 10s, 30s

---

#### Panel 3: Tool Call Latency and Success Rate

**Metric:** `zobot_tool_call_duration_seconds`
**Type:** Graph with success/error breakdown
**Description:** Duration and outcome of tool executions, split by tool name and version.

```promql
# Average latency by tool
rate(zobot_tool_call_duration_seconds_sum[5m])
/
rate(zobot_tool_call_duration_seconds_count[5m])

# Success rate by tool
sum by (tool) (rate(zobot_tool_call_duration_seconds_count{status="success"}[5m]))
/
sum by (tool) (rate(zobot_tool_call_duration_seconds_count[5m]))

# p95 by tool
histogram_quantile(0.95, sum by (tool, le) (rate(zobot_tool_call_duration_seconds_bucket[5m])))
```

**Bucket boundaries:** 10ms, 50ms, 100ms, 500ms, 1s, 5s

---

#### Panel 4: Ticket Operations

**Metric:** `zobot_ticket_operations_total`
**Type:** Stacked bar chart
**Description:** Ticket create/update operations with success/failure status.

```promql
# Rate by operation type
sum by (operation) (rate(zobot_ticket_operations_total[5m]))

# Error rate
sum(rate(zobot_ticket_operations_total{status="error"}[5m]))
/
sum(rate(zobot_ticket_operations_total[5m]))
```

---

#### Panel 5: Escalation Rate

**Metric:** `zobot_escalations_total`
**Type:** Graph with breakdown by reason
**Description:** Rate of conversations escalated to human agents. Spike indicates upstream issues or frustrated users.

```promql
# Total escalation rate
sum(rate(zobot_escalations_total[5m]))

# By reason (frustration_detected, max_clarifications, max_turns)
sum by (reason) (rate(zobot_escalations_total[5m]))

# By channel
sum by (channel) (rate(zobot_escalations_total[5m]))

# Escalation ratio (escalations / total messages)
sum(rate(zobot_escalations_total[5m]))
/
sum(rate(zobot_messages_processed_total[5m]))
```

---

#### Panel 6: State Transitions

**Metric:** `zobot_state_transitions_total`
**Type:** Sankey diagram or stacked bar chart
**Description:** Conversation state flow. States: `NEW`, `ACTIVE_QA`, `LEAD_QUALIFICATION`, `MEETING_BOOKING`, `SUPPORT_TRIAGE`, `ESCALATED`, `RESOLVED`.

```promql
# Transition rate by from/to
sum by (from, to) (rate(zobot_state_transitions_total[5m]))

# Transitions into ESCALATED
sum(rate(zobot_state_transitions_total{to="ESCALATED"}[5m]))

# Transitions into RESOLVED
sum(rate(zobot_state_transitions_total{to="RESOLVED"}[5m]))
```

---

#### Panel 7: Active Conversations

**Metric:** `zobot_active_conversations`
**Type:** Gauge (single stat + sparkline)
**Description:** Current number of active conversations by channel.

```promql
# Total active
sum(zobot_active_conversations)

# By channel
zobot_active_conversations
```

---

#### Panel 8: HTTP Request Duration

**Metric:** `zobot_http_request_duration_seconds`
**Type:** Heatmap
**Description:** HTTP request latency for all endpoints (webhook, health, admin, metrics).

```promql
# p95 by route
histogram_quantile(0.95, sum by (route, le) (rate(zobot_http_request_duration_seconds_bucket[5m])))

# Error responses (5xx)
sum(rate(zobot_http_request_duration_seconds_count{status_code=~"5.."}[5m]))

# Rate by status code
sum by (status_code) (rate(zobot_http_request_duration_seconds_count[5m]))
```

**Bucket boundaries:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

---

#### Panel 9: Node.js Process Metrics (built-in)

Default Node.js metrics are collected with the `zobot_` prefix:

```promql
# Event loop lag
zobot_nodejs_eventloop_lag_seconds

# Heap usage
zobot_nodejs_heap_size_used_bytes / zobot_nodejs_heap_size_total_bytes

# Active handles / requests
zobot_nodejs_active_handles_total
zobot_nodejs_active_requests_total
```

---

## 6. Alerts

Configure the following alerts in Prometheus Alertmanager or your monitoring platform. Thresholds are tuned for production; adjust based on traffic patterns.

### Alert 1: LLM P99 Latency > 10s

```yaml
- alert: ZobotLLMHighLatency
  expr: >
    histogram_quantile(0.99, rate(zobot_llm_request_duration_seconds_bucket[5m])) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "LLM p99 latency exceeds 10 seconds"
    description: >
      The 99th percentile latency for OpenAI API calls has been above 10 seconds
      for 5 minutes. Current value: {{ $value | printf "%.1f" }}s.
      Check OpenAI status page and consider reducing OPENAI_MAX_TOKENS.
    runbook: "#34-handling-openai-api-outages"
```

### Alert 2: Error Rate > 5%

```yaml
- alert: ZobotHighErrorRate
  expr: >
    (
      sum(rate(zobot_http_request_duration_seconds_count{status_code=~"5.."}[5m]))
      /
      sum(rate(zobot_http_request_duration_seconds_count[5m]))
    ) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "HTTP error rate exceeds 5%"
    description: >
      More than 5% of HTTP requests are returning 5xx errors over the last 5 minutes.
      Current error rate: {{ $value | printf "%.1f%%" }}.
      Check /ready endpoint and logs for root cause.
    runbook: "#36-high-error-rate-triage"
```

### Alert 3: Escalation Rate Spike

```yaml
- alert: ZobotEscalationSpike
  expr: >
    (
      sum(rate(zobot_escalations_total[5m]))
      /
      sum(rate(zobot_messages_processed_total[5m]))
    ) > 0.3
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Escalation rate exceeds 30% of messages"
    description: >
      More than 30% of messages are resulting in escalation to human agents.
      This may indicate an LLM issue, knowledge base gap, or frustrated users.
      Top escalation reasons: check zobot_escalations_total by reason label.
    runbook: "#34-handling-openai-api-outages"
```

### Alert 4: Redis Disconnected

```yaml
- alert: ZobotRedisDown
  expr: >
    up{job="zobot"} == 1
    unless
    (zobot_ready_check_redis_status == 1)
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Redis is unreachable from Zobot"
    description: >
      The /ready endpoint reports Redis as unavailable. Zobot is running on
      in-memory fallback. Conversations are not persisted and multi-instance
      state sharing is broken.
    runbook: "#35-redis-connection-loss"
```

**Alternative probe-based approach** (if not exporting ready check as a metric):

```yaml
- alert: ZobotRedisDown
  expr: >
    probe_success{job="zobot-ready-probe"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Zobot /ready endpoint returning non-200"
    description: >
      The readiness probe is failing. Check Redis and OpenAI connectivity.
    runbook: "#35-redis-connection-loss"
```

### Alert 5: Circuit Breaker Activation

```yaml
- alert: ZobotCircuitBreakerOpen
  expr: >
    sum(rate(zobot_llm_request_duration_seconds_count{status="error"}[1m])) >= 5
    and
    sum(rate(zobot_llm_request_duration_seconds_count{status="success"}[1m])) == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "LLM circuit breaker is likely open"
    description: >
      5 or more consecutive LLM failures with zero successes in the last minute
      indicates the circuit breaker has tripped. All conversations are being
      escalated to human agents. The breaker auto-resets after 60 seconds.
      If this alert persists beyond 2 minutes, OpenAI may be experiencing
      a sustained outage.
    runbook: "#34-handling-openai-api-outages"
```

### Alert 6: High Tool Failure Rate

```yaml
- alert: ZobotToolFailures
  expr: >
    (
      sum by (tool) (rate(zobot_tool_call_duration_seconds_count{status="error"}[5m]))
      /
      sum by (tool) (rate(zobot_tool_call_duration_seconds_count[5m]))
    ) > 0.2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Tool {{ $labels.tool }} failure rate exceeds 20%"
    description: >
      The tool {{ $labels.tool }} is failing more than 20% of the time.
      Check downstream API health and tool timeout (15s).
```

### Alert 7: High Active Conversations (capacity warning)

```yaml
- alert: ZobotHighConversationCount
  expr: >
    sum(zobot_active_conversations) > 500
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Active conversation count exceeds 500"
    description: >
      There are {{ $value }} active conversations. Monitor memory usage
      and Redis connection pool. Consider scaling out if this persists.
```

---

## 7. Log Analysis

### Log Format

Zobot uses **pino** for structured JSON logging. Every log line is a valid JSON object.

**Standard fields in every log entry:**

| Field | Type | Description |
|---|---|---|
| `level` | string | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `time` | string | ISO 8601 timestamp |
| `msg` | string | Human-readable log message |
| `requestId` | string (UUID) | Correlation ID for tracing a single request across all components |
| `conversationId` | string | Links logs to a specific conversation |
| `channel` | string | Inbound channel (e.g., `salesiq`) |
| `tenantId` | string | Tenant identifier for multi-tenant isolation |

### Request Correlation

Every inbound webhook generates a `requestId` (UUID v4) via the `TraceContext`. This ID propagates through all log entries for that request:

```
Webhook handler --> Orchestrator --> AgentCore --> ToolRuntime
     |                   |              |             |
     +---- requestId ----+---- same ----+---- same ---+
```

**Querying all logs for a single request:**

```bash
# With jq (from raw log output)
cat zobot.log | jq 'select(.requestId == "a1b2c3d4-...")'

# In a log aggregator (e.g., Loki, Elasticsearch)
# Query: requestId="a1b2c3d4-..."
```

### Key Log Events

**Message lifecycle (info level):**

```json
{"level":"info","time":"...","requestId":"...","msg":"New conversation started"}
{"level":"info","time":"...","requestId":"...","intent":"lead_inquiry","shouldEscalate":false,"toolCallCount":1,"msg":"Agent response generated"}
{"level":"info","time":"...","requestId":"...","tool":"create_lead","success":true,"msg":"Tool executed"}
{"level":"info","time":"...","requestId":"...","ticketId":"12345","msg":"Ticket created for new conversation"}
{"level":"info","time":"...","requestId":"...","state":"LEAD_QUALIFICATION","intent":"lead_inquiry","escalated":false,"toolCalls":1,"spanCount":6,"msg":"Message processing complete"}
```

**State transitions (info level):**

```json
{"level":"info","time":"...","conversationId":"...","from":"NEW","to":"ACTIVE_QA","reason":"greeting","msg":"State transition"}
```

**Tool call audit trail (info level):**

```json
{
  "level": "info",
  "time": "...",
  "toolCallLog": {
    "tool": "create_lead",
    "version": "1.0.0",
    "args": {"name": "[PHONE_REDACTED]", "email": "[EMAIL_REDACTED]", "company": "Acme Corp"},
    "result": {"success": true, "data": "[redacted]"},
    "durationMs": 234,
    "timestamp": 1700000000000,
    "requestId": "...",
    "conversationId": "...",
    "tenantId": "default"
  },
  "msg": "Tool call completed"
}
```

Note: Tool arguments are automatically PII-redacted before logging. Result data payloads are replaced with `[redacted]` to prevent PII leakage into logs.

**Error patterns to watch:**

| Log message | Level | Meaning |
|---|---|---|
| `LLM request failed` | error | OpenAI API call failed (timeout, rate limit, auth) |
| `Circuit breaker opened` | error | 5 consecutive LLM failures; all requests now short-circuited |
| `Circuit breaker open; returning fallback` | warn | Request received while breaker is open |
| `Tool execution failed` | error | A tool handler threw an error or timed out |
| `Failed to create ticket on NEW conversation` | error | SalesIQ ticketing API error |
| `Failed to send outbound message` | error | Could not deliver response to SalesIQ |
| `Rate limit exceeded` | warn | Visitor or tenant hit rate limit |
| `Message blocked` | warn | Abuse detector blocked a message |
| `Invalid state transition attempted` | warn | State machine received an illegal transition |
| `Config reload failed` | error | YAML parsing or loading error during hot reload |
| `Orchestrator fatal error` | error | Unhandled error in message processing pipeline |
| `Failed to start server` | fatal | Application could not bind to port |

### PII Redaction

All log output passes through the PII redactor (`src/observability/pii-redactor.ts`), which replaces:

| Pattern | Replacement |
|---|---|
| Email addresses | `[EMAIL_REDACTED]` |
| Phone numbers | `[PHONE_REDACTED]` |
| Social security numbers | `[SSN_REDACTED]` |
| Credit card numbers | `[CC_REDACTED]` |

This applies to tool call argument logging via `redactObject()`. Raw user messages in orchestrator logs may still contain PII if logged at debug level; ensure `LOG_LEVEL` is set to `info` or above in production.

### Log Level Guidance

| Environment | Recommended `LOG_LEVEL` |
|---|---|
| Production | `info` |
| Staging | `debug` |
| Development | `debug` or `trace` |
| Investigating a production issue | Temporarily set to `debug`, then revert |

Change the log level by setting the `LOG_LEVEL` environment variable and restarting the application.

### Span Tracing

Each request generates a `TraceContext` with embedded span records for performance analysis:

| Span Name | What It Measures |
|---|---|
| `orchestrator.handleMessage` | Full message processing pipeline |
| `conversation.load` | Loading conversation from Redis/memory |
| `ticket.create` | Creating a new SalesIQ ticket |
| `agent.process` | LLM call (prompt building + OpenAI API) |
| `tools.execute` | All tool executions for the request |
| `ticket.update` | Updating ticket with agent response |
| `outbound.sendMessage` | Delivering response to the user |

Span count and timings are included in the final `Message processing complete` log entry.

---

## 8. Transcript Storage

### Default: Disabled

Transcript storage is **disabled by default** (`ENABLE_TRANSCRIPTS=false`). When disabled, conversation data exists only in the conversation store (Redis or in-memory) and is subject to the 24-hour TTL.

### Enabling Transcripts

To enable persistent transcript storage, set the following environment variables:

```bash
ENABLE_TRANSCRIPTS=true
TRANSCRIPT_ENCRYPTION_KEY=<32-byte-hex-key>
```

**Generating an encryption key:**

```bash
# Generate a 256-bit (32-byte) key
openssl rand -hex 32
```

### Encryption at Rest

When `ENABLE_TRANSCRIPTS=true` and a `TRANSCRIPT_ENCRYPTION_KEY` is provided, all persisted transcripts are encrypted using AES-256 before being written to storage.

**Security requirements:**

- The `TRANSCRIPT_ENCRYPTION_KEY` must be a 32-byte (256-bit) hex-encoded string.
- Store the key in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets). Do not commit it to source control.
- Rotate the key periodically. When rotating, re-encrypt existing transcripts with the new key.
- If the key is lost, encrypted transcripts are irrecoverable.

### Data Retention Considerations

| Item | Retention | Notes |
|---|---|---|
| Active conversation (Redis) | 24 hours TTL | Automatically evicted |
| Active conversation (in-memory) | Until process restart | Lost on restart |
| Persisted transcripts | Configurable | Implement your own retention policy |
| Prometheus metrics | Based on Prometheus config | Typically 15-30 days |
| Application logs | Based on log aggregator config | Follow your organization's policy |

### Compliance Notes

- PII redaction in logs is automatic but transcript storage (when enabled) preserves the full conversation including PII.
- Ensure transcript storage complies with your data protection requirements (GDPR, CCPA, etc.).
- Implement data subject access request (DSAR) and deletion workflows for transcripts.
- The 24-hour TTL on Redis conversations serves as a natural data minimization mechanism.

---

## Appendix: Docker Compose Quick Reference

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f zobot

# Restart only the application (keep Redis running)
docker compose restart zobot

# Rebuild after code changes
docker compose build zobot && docker compose up -d zobot

# Check Redis directly
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli info memory

# Check Zobot container health
docker compose ps
```

## Appendix: Useful One-Liners

```bash
# Count active Redis conversation keys
redis-cli --scan --pattern "zobot:conv:*" | wc -l

# Get a specific conversation from Redis
redis-cli GET "zobot:conv:<conversation-id>" | jq .

# Test the webhook endpoint manually
curl -X POST http://localhost:3000/webhooks/salesiq \
  -H "Content-Type: application/json" \
  -H "X-Zoho-Signature: test" \
  -d '{"action":"visitor.message","data":{"visitor":{"id":"v1"},"message":{"text":"hello"}}}'

# Reload config
curl -X POST http://localhost:3000/admin/reload-config \
  -H "X-Admin-Api-Key: ${ADMIN_API_KEY}"

# Watch metrics in real-time
watch -n 5 'curl -s http://localhost:3000/metrics | grep -E "zobot_(messages|escalations|active)"'

# Parse structured logs for errors in the last hour
cat zobot.log | jq 'select(.level == "error") | {time, msg, requestId, err}'
```
