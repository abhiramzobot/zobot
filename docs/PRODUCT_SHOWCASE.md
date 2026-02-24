# Resolvr Enterprise AI Platform

### Intelligent Customer Service Automation for E-Commerce

> **Your customers don't want to wait. Your agents shouldn't have to repeat. Your chatbot should actually work.**

---

## Executive Summary

**Resolvr** is a production-grade AI customer service platform that automates 70-85% of support conversations across WhatsApp, Apple Business Chat, and website live chat — while seamlessly escalating complex cases to human agents with full context.

Built on a **multi-LLM architecture** (OpenAI, Anthropic Claude, Google Gemini) with automatic failover, Resolvr combines deterministic business logic with adaptive AI to deliver consistent, policy-compliant responses at scale. A built-in **self-learning pipeline** with 7 autonomous analyzers continuously discovers new FAQs, identifies knowledge gaps, tracks sentiment trends, and measures response quality — without manual intervention. A **Voice-of-Customer (VOC) intelligence engine** extracts structured NLU signals from every message, while **enterprise PII governance** protects sensitive customer data with 12+ detection patterns and encrypted tokenized storage.

**Enhancement v2** adds 28 enterprise features across 5 phases: an **Agent Co-Pilot** with real-time AI suggestions for human agents, **SLA management** with breach prediction and alerting, **omnichannel conversation continuity** that carries context across WhatsApp/Web/iChat, **Customer 360 profile injection** at inference time, **in-chat payment collection** via Razorpay, **A/B testing** with hash-based variant assignment, an **outbound proactive messaging engine** with governance, **GDPR compliance** (Article 17 erasure + Article 20 portability), **intelligent skill-based agent routing**, **rich media responses** (product carousels, quick replies, status cards), an **immutable audit trail** with SHA-256 chain hashing, **graceful degradation** with per-dependency circuit breakers and static fallbacks, and a **BI analytics dashboard** — all production-wired with zero compilation errors across 134 TypeScript files.

### Why Resolvr?

| Challenge | Resolvr Solution |
|-----------|---------------|
| High support costs at scale | Automates 70-85% of conversations, reducing agent headcount |
| Inconsistent agent responses | Deterministic state machine + AI governance prompt ensures policy-compliant behavior |
| Single LLM vendor lock-in | Multi-provider routing with automatic failover + graceful degradation |
| Static bot that never improves | 7-analyzer self-learning pipeline + A/B testing engine discovers and validates improvements |
| No visibility into bot performance | 55+ Prometheus metrics, BI dashboard, structured logging, VOC analytics |
| Rigid chatbots that can't handle complexity | 10-state conversation lifecycle with SOP-driven workflows |
| Poor escalation experience | 10-trigger VOC-enhanced escalation + skill-based intelligent routing |
| Customer data exposure risk | Enterprise PII governance + GDPR compliance (erasure + portability) + immutable audit trail |
| Reactive-only support | Proactive support engine + outbound messaging with governance |
| Repetitive clarification loops | Confidence-based routing minimizes unnecessary questions |
| Agents lack AI assistance | Co-Pilot mode provides real-time suggestions, knowledge search, smart actions |
| No SLA tracking | SLA engine with tier assignment, TTFR/TTR tracking, breach prediction + alerting |
| Context lost across channels | Omnichannel continuity merges conversation history across WhatsApp/Web/iChat |
| Can't collect payments in-chat | Razorpay payment link generation directly within conversations |
| No rich media support | Product carousels, quick reply buttons, status cards with channel-aware fallbacks |

### Platform at a Glance

```
 70-85%        3 LLM           10-State         16 Backend       7 Self-Learning
 Automation    Providers       State Machine    Tool Integrations  Analyzers
 Rate          + Failover      (Deterministic)  (Governed+Cached) (Autonomous)

 3 Channels    55+ Metrics     11 Themes        Multi-Tenant      VOC Intelligence
 (WhatsApp,    (Prometheus     (Festive +       (Isolated         Engine (NLU +
  Web, iChat)  + BI Dashboard) Custom)          Configs)          Sentiment)

 12+ PII       Hybrid RAG      Agent Co-Pilot   SLA Management    GDPR Compliant
 Patterns      (BM25+Vector)   (AI-Assisted     (Tier Assignment  (Data Export +
 (Encrypted)   Anti-Halluc.     Agent Mode)      Breach Alerting)  Right to Erasure)

 Omnichannel   In-Chat         A/B Testing      Rich Media        Graceful
 Continuity    Payments        (Hash-Based       (Carousels,       Degradation
 (Cross-Chan.) (Razorpay)      Experiments)      Quick Replies)    (Circuit Breakers)

 Audit Trail   Outbound        Skill-Based      Incident          134 TypeScript
 (SHA-256      Proactive       Intelligent      Auto-Detection    Source Files
  Chain Hash)  Engine          Routing          (Error+CSAT)      (Zero Errors)
```

---

## The Problem

E-commerce customer service teams face a fundamental scaling challenge:

**Volume vs. Quality** — As order volumes grow, support ticket volumes grow proportionally. Hiring more agents is expensive, training takes weeks, and quality degrades under pressure. Customers repeat the same questions ("Where is my order?", "How do I return this?", "Is this in stock?") thousands of times per day — each requiring an agent to look up systems, apply policies, and compose a response.

**Existing chatbot solutions fail because they:**
- Give scripted, robotic responses that frustrate customers
- Can't access real backend systems (order management, shipping, returns)
- Don't understand context — every message is treated in isolation
- Escalate too much (defeating the purpose) or too little (damaging CSAT)
- Never learn from their mistakes
- Lock you into a single AI vendor with no fallback

---

## The Solution

Resolvr is not a chatbot — it's an **AI agent** that understands your business operations, connects to your backend systems, follows your SOPs, and gets smarter over time.

```
                          Customer Messages
                                 |
              +------------------+------------------+
              |                  |                  |
        [ WhatsApp ]     [ Business Chat ]    [ Web Widget ]
              |                  |                  |
              +------------------+------------------+
                                 |
                    +------------------v------------------+
                    |                                     |
                    |          RESOLVR PLATFORM              |
                    |                                     |
                    |  +------------------------------+   |
                    |  | VOC Pre-Processor + PII Gate  |   |
                    |  | (Language, Entities, Urgency, |   |
                    |  |  Risk Flags, PII Tokenization)|   |
                    |  +-------------+----------------+   |
                    |                |                     |
                    |  +-------------v----------------+   |
                    |  | Proactive Context Checker     |   |
                    |  | (Delays, SLA Breaches, Risk)  |   |
                    |  +-------------+----------------+   |
                    |                |                     |
                    |  +-------------v----------------+   |
                    |  | Conversation Orchestrator     |   |
                    |  | (21-Step Pipeline)            |   |
                    |  +-------------+----------------+   |
                    |                |                     |
                    |  +-------------v----------------+   |
                    |  | Multi-LLM AI Engine           |   |
                    |  | (GPT / Claude / Gemini)       |   |
                    |  +------+---------+-------------+   |
                    |         |         |                  |
                    |  +------v---+ +---v--------------+  |
                    |  | Tool     | | Hybrid RAG       |  |
                    |  | Runtime  | | (BM25 + Vector)  |  |
                    |  | (Retry + | | Anti-Hallucinate |  |
                    |  |  Valid.) | +------------------+  |
                    |  +---------+                        |
                    |         |                           |
                    |  +------v---------+  +-----------+  |
                    |  | Confidence     |  | VOC Store |  |
                    |  | Router + 10-   |  | + Learning|  |
                    |  | Trigger Escal. |  | Pipeline  |  |
                    |  +----------------+  +-----------+  |
                    |                                     |
                    +---+--------+--------+---------+----+
                        |        |        |         |
                        v        v        v         v
                   [ Order  [ Ship   [ Return  [ PII
                     Mgmt ]  Track]   System ]  Vault ]
```

---

## Platform Capabilities

### 1. Multi-Channel Support

Resolvr serves customers wherever they are — with a single unified AI brain:

| Channel | Integration | Features |
|---------|------------|----------|
| **WhatsApp** | Via Zoho SalesIQ + Meta Cloud API | Full conversational AI, tool access, image sharing |
| **Apple Business Chat** | Via Zoho SalesIQ | Same capabilities as WhatsApp |
| **Website Live Chat** | Embeddable widget or full-page UI | Rich UI, file uploads, themes, CSAT surveys |

Every channel uses the same orchestration engine, knowledge base, and AI models. Channel-specific policies (message length limits, max conversation turns, enabled tools) are configured per-tenant.

### 2. Multi-LLM AI Engine

Unlike platforms locked to a single AI provider, Resolvr runs on a **multi-provider architecture** with three routing strategies:

```
                    +-------------------+
                    |   Model Router    |
                    +---+---+---+-------+
                        |   |   |
              +---------+   |   +---------+
              |             |             |
        +-----v-----+ +----v------+ +----v------+
        | OpenAI     | | Anthropic | | Google    |
        | GPT-5.2    | | Claude    | | Gemini    |
        |            | | Sonnet    | | Flash     |
        +------------+ +-----------+ +-----------+
```

| Strategy | How It Works | Best For |
|----------|-------------|----------|
| **Config Priority** | Always use primary; failover to secondary/tertiary on error | Production stability |
| **A/B Testing** | Split traffic by percentage between providers | Comparing model quality |
| **Intent-Based** | Route specific intents to specific providers | Cost optimization |

**Zero-downtime failover**: If your primary LLM goes down, Resolvr automatically routes to the next provider. A circuit breaker activates after 5 consecutive failures, and auto-escalates to human agents during outages — customers are never stranded.

### 3. Deterministic Conversation State Machine

Every conversation follows a **10-state lifecycle** with validated transitions — no hallucinated state jumps, no unpredictable behavior:

```
  NEW --> ACTIVE_QA --> ORDER_INQUIRY ----+
              |                           |
              +--> SHIPMENT_TRACKING -----+
              |                           |
              +--> RETURN_REFUND ---------+
              |                           |
              +--> PRODUCT_INQUIRY -------+
              |                           |
              +--> LEAD_QUALIFICATION ----+---> ESCALATED ---> RESOLVED
              |                           |
              +--> MEETING_BOOKING -------+
              |                           |
              +--> SUPPORT_TRIAGE --------+
```

The AI classifies intent, but the **state machine validates every transition**. Invalid transitions are rejected — this prevents the AI from skipping steps in your business workflows (e.g., jumping from order inquiry directly to refund without checking eligibility).

### 4. Backend Tool Integrations

Resolvr doesn't just answer questions — it **takes action** by calling your real backend systems:

| Tool | What It Does | Example |
|------|-------------|---------|
| **Order Lookup** | Search orders by phone or order number | "Where is my order Q2345678?" |
| **Shipment Details** | Get AWB, carrier, items, dispatch dates | "What's the courier for my order?" |
| **Live Tracking** | Real-time courier tracking with status | "Track my shipment AWB12345" |
| **Return Status** | Check return/refund processing status | "What's happening with my return?" |
| **Product Search** | Search catalog with pricing and stock | "Do you have wireless earbuds under 2000?" |
| **Ticket Notes** | Add internal notes to support tickets | Automatic documentation |
| **Human Handoff** | Escalate to human agent with full context | Triggered by frustration or complexity |
| **Cancel Order** | Cancel orders with double-confirm + auto-refund | "Please cancel my order" |
| **Update Address** | Pre-dispatch address modification with PIN validation | "Change delivery address to..." |
| **Change Payment** | Switch between COD and Prepaid | "I want to pay online instead of COD" |
| **Payment Link** | Generate Razorpay payment link in-chat | "Send me a payment link for ₹2,499" |
| **Add to Cart** | Add products to in-chat shopping cart | "Add this to my cart" |
| **View Cart** | Show cart contents with subtotal and savings | "Show my cart" |
| **Remove from Cart** | Remove items, update quantity, or clear cart | "Remove the first item from my cart" |

**Governed Execution**: Every tool call goes through a 14-step governance chain:
1. Does this tool exist?
2. Is it enabled for this tenant?
3. Is it allowed on this channel?
4. Has the rate limit been exceeded?
5. **Dependency health check** — is the backing service available? (circuit breaker)
6. **Cache lookup** — has this exact call been made recently? (tool result caching)
7. Are the arguments valid (JSON Schema)?
8. Execute with 15-second timeout
9. On failure: automatic single retry with backoff (configurable per tool)
10. **Record dependency health** — update circuit breaker state (success/failure)
11. **Cache store** — save successful results for cacheable tools (configurable TTL)
12. Validate output against tool's output schema
13. On persistent failure: build structured error context for honest response
14. Log result (PII redacted) + **audit trail entry** (SHA-256 chain hashed)

### 5. SOP-Driven Knowledge Engine

Resolvr's knowledge base is structured, version-controlled, and searchable — not a black box:

**Three Knowledge Layers:**

| Layer | Format | Contents | Example |
|-------|--------|----------|---------|
| **FAQ** | YAML | Question-answer pairs with categories and tags | "What is your return policy?" |
| **Policies** | YAML | Business rules, eligibility criteria, workflows | Return decision matrix, refund timelines |
| **Escalation Matrix** | YAML | Desk assignments, TATs, issue routing | "Refund mismatch → Payment Desk, 24hr TAT" |

**SOP Workflow Example — Return Handling:**

```
Step 1: Verify Delivery
   - Check order delivered via shipment details tool
   - Confirm within return window

Step 2: Identify Issue Category
   - Damaged / Defective / Wrong Item / Missing Part / Change of Mind

Step 3: Check Eligibility (Decision Rules)
   - Rule 1: Within window + unused + sealed    --> Approve
   - Rule 2: Damaged/wrong + within 48hrs       --> Fast-track approve
   - Rule 3: Item value < threshold              --> Refund only, no physical return
   - Rule 4: Used consumable                     --> Reject
   - Rule 5: Outside window                      --> Escalate to returns team
   - Rule 6: High-risk customer                  --> Escalate to review team

Step 4: Process Return
   - Generate structured summary for ticket
   - Initiate reverse pickup

Step 5: Resolution
   - Replacement (priority) > Store Credit > Refund
```

This isn't AI guessing — it's **deterministic business logic** executed consistently across thousands of conversations.

### 6. Customer Intelligence

Resolvr classifies customers based on their history and adapts its behavior:

| Segment | Criteria | Handling |
|---------|----------|----------|
| **Loyal** | 3+ orders, clean return history | Approve returns liberally, prioritize replacement |
| **Regular** | 1-2 orders | Standard SOP handling |
| **High-Risk** | Frequent returns, suspicious patterns | Escalate for manual review |

This classification is configurable per tenant — you define the thresholds and rules.

### 7. 10-Trigger VOC-Enhanced Escalation Engine

Resolvr escalates when it should — not too early, not too late. Ten escalation triggers are evaluated on every message, combining traditional signals with real-time VOC intelligence:

| Priority | Trigger | Detection |
|----------|---------|-----------|
| 1 | AI explicitly flags | LLM determines case is too complex |
| 2 | Escalation intent detected | "I want to speak to a manager" |
| 3 | VOC urgency = critical | Urgency classifier detects critical signals |
| 4 | Legal threat detected | VOC risk flag: "consumer court", "legal notice" |
| 5 | Social media threat | VOC risk flag: "I'll post on Twitter/Instagram" |
| 6 | Policy exception requested | Customer requests action outside policy bounds |
| 7 | Repeat complaint detected | Same issue raised 2+ times across turns |
| 8 | Severe negative sentiment | VOC sentiment score below -0.7 threshold |
| 9 | Frustration keywords | "This is terrible", "bekaar" (supports Hindi/Hinglish) |
| 10 | Max turns/clarifications | Configurable per channel (default: 10-15 turns, 2 clarifications) |

**What human agents receive on escalation (VOC-enriched handoff):**
- Full conversation transcript
- Structured memory (customer name, email, phone, order numbers, issue category)
- AI-generated summary of the issue
- Intent classification with confidence scores
- Sentiment analysis (label, score, emotion)
- Detected languages
- Customer lifecycle stage (browsing, pre-purchase, post-purchase, at-risk)
- Risk flags (legal threat, churn risk, repeat complaint, policy exception)
- Entity extraction (order numbers, AWBs, amounts)
- Customer segment (Loyal/Regular/High-Risk)

Agents don't start from scratch — they have complete context and VOC intelligence.

### 8. Self-Learning Pipeline

Most chatbots are static. Resolvr **gets smarter over time** with 7 autonomous analyzers:

```
  Resolved Conversations + VOC Records
           |
           v
  +-------------------+
  | Conversation      |
  | Collector         |  ← Now enriched with VOC aggregates
  +--------+----------+     (sentiment, confidence, languages,
           |                  urgency, risk flags, FCR tracking)
  +--------v----------+
  |  Learning Pipeline |
  |                    |
  |  +-- FAQ Discovery -------> "Customers keep asking about X"
  |  |                           --> Auto-generate FAQ candidate
  |  |
  |  +-- Knowledge Gaps -------> "Bot couldn't answer Y"
  |  |                            --> Flag for knowledge base update
  |  |
  |  +-- Escalation Patterns --> "70% of escalations are about Z"
  |  |                            --> Suggests new tool or policy
  |  |
  |  +-- Response Quality -----> "This response got 1-star CSAT"
  |  |                            --> Flag for prompt improvement
  |  |
  |  +-- Intent Patterns ------> "New intent cluster detected"
  |  |                             --> Suggest new state/workflow
  |  |
  |  +-- Sentiment Trends -----> "Negative sentiment spiking for returns"
  |  |                             --> Detect degradation, correlate with intents
  |  |
  |  +-- VOC Quality ----------> "Confidence dropping for Hindi queries"
  |                                --> FCR rate, clarification rate, cross-language comparison
  +-------------------+
```

**Admin controls:**
- View discovered FAQ candidates and approve/reject
- Monitor prompt version performance (A/B comparison)
- Trigger manual pipeline runs
- Configure pipeline frequency (default: every 24 hours)
- VOC analytics dashboard (sentiment distribution, FCR rate, confidence by intent)
- Per-conversation VOC audit trail

### 9. Enterprise Chat UI

The built-in web chat interface includes features expected in enterprise support solutions:

**Session Management:**
- Pre-chat form (name, email collection)
- End chat / start new chat
- Session reconnection on page reload
- Chat history panel (view all past conversations)
- Full transcript viewer

**Customer Experience:**
- CSAT survey (1-5 stars + feedback) after chat ends
- File/image/video upload (for damage photos, documents)
- Drag-and-drop file attachment
- Sound notifications (toggleable)
- Transcript download (.txt export)
- Widget mode (floating bubble with unread badge)
- Relative timestamps on every message

**11 Visual Themes:**

Customers can choose their preferred theme at any time:

| Theme | Style | Auto-Suggested |
|-------|-------|---------------|
| Light | Clean blue/white | Default |
| Dark | Purple/teal/dark | Via system preference |
| Diwali | Orange/gold/warm | Oct-Nov |
| New Year | Purple/gold | Dec-Jan |
| Independence Day | Tricolor | August |
| Republic Day | Navy/saffron | January |
| Ramadan | Emerald/gold | Configurable |
| Doctors Day | Teal/medical | July |
| Christmas | Red/green | December |
| Halloween | Orange/purple/dark | October |
| Easter | Pastel purple/pink | Configurable |

All themes use a CSS variable system — adding custom brand themes takes minutes.

### 10. Multi-Language Support

Resolvr detects and responds in the customer's language:

- **English** — Full support
- **Hindi** — Native support including Devanagari script
- **Hinglish** — Mixed Hindi-English conversational style
- **Frustration detection** in both English and Hindi ("bekaar", "ghatiya", "dhokha")

Language support is extensible to any language supported by the underlying LLM.

### 11. VOC Intelligence Engine

Every inbound message is analyzed by a **Voice-of-Customer (VOC) pre-processor** before reaching the LLM — extracting structured NLU signals in under 10ms:

```
  INBOUND MESSAGE
        |
        v
  [VOC Pre-Processor]  ← Fast, synchronous, <10ms
        |
        |  Language Detection (EN/HI/Hinglish, script detection)
        |  Entity Extraction (orders, AWBs, phones, emails, amounts)
        |  Urgency Classification (low/medium/high/critical)
        |  Risk Flag Detection (legal threat, churn risk, repeat complaint)
        |  Repeat Complaint Detection (same issue 2+ times across turns)
        |  Policy Exception Detection (request outside policy bounds)
        |
        v
  [LLM Call]  ← Enhanced with pre-processor context
        |
        |  Returns: confidence score, sentiment, customer stage,
        |           resolution receipt, FCR achieved flag
        |
        v
  [VOC Record Build]  ← Merge pre-processor + LLM output
        |
        v
  [VOC Store]  ← Async save (Redis or in-memory)
```

**Canonical VOC Record** — one per message turn, capturing:
- Detected languages with confidence and script
- Multi-label intent classification with confidence scores
- Typed entity extraction (order numbers, AWBs, phones, products, amounts)
- Sentiment analysis (positive/negative/neutral, -1 to +1 score, emotion)
- Urgency classification with signal details
- Customer lifecycle stage (browsing, pre-purchase, post-purchase, at-risk)
- Risk flags (churn risk, legal threat, social media threat, repeat complaint)
- Knowledge source tracking (which FAQ/policy answered the query)
- Response metadata (confidence, latency, tokens, provider)

**Resolution Confirmation Receipts** — after every action, the AI provides a structured receipt:
- What was done ("Looked up order status", "Initiated return request")
- Reference ID (order number, ticket ID, AWB)
- Expected timeline ("Refund within 5-7 business days")
- Next steps ("You will receive an SMS with tracking details")

### 12. Hybrid Knowledge Retrieval (BM25 + Vector Search)

Resolvr uses a **Reciprocal Rank Fusion** approach combining traditional keyword search with semantic vector embeddings:

```
  Customer Query
        |
        +-------> [BM25 Keyword Search]  ← Existing, exact match
        |                |
        +-------> [Vector Similarity]    ← OpenAI embeddings, cosine similarity
                         |
                         v
                 [Reciprocal Rank Fusion]
                         |
                         v
                 Top-K merged results with source metadata
                 [Source: faq/returns | Confidence: 92%]
```

- **BM25** excels at exact keyword matches ("DK-12345", "return policy")
- **Vector search** excels at semantic understanding ("I got the wrong thing" matches return/replace knowledge)
- **Anti-hallucination guard**: If no results score above threshold, the AI responds honestly ("I don't have specific information on that") rather than fabricating answers
- **Citation tracking**: Every knowledge result includes source and confidence for audit
- All ~200 KB entries are embedded on startup (~5-10 seconds, in-memory)
- Configurable alpha parameter (keyword vs. vector weighting)

### 13. Confidence-Based Response Routing

Instead of treating every response the same, Resolvr routes based on the AI's confidence level — minimizing unnecessary clarification loops and maximizing first-contact resolution:

| Confidence | Clarification Count | Action |
|-----------|-------------------|--------|
| **>= 0.8** | Any | Respond directly. Proceed with resolution. |
| **0.5 - 0.8** | Any | Respond + soft fallback: "If this doesn't fully match your issue, let me know." |
| **< 0.5** | 0 | Make one reasonable attempt at resolution |
| **< 0.5** | >= 1 | Escalate immediately. Do not enter clarification loops. |

**Clarification Minimization Rules:**
- Before asking ANY question: check conversation history, extracted entities, knowledge base, and available tools
- Never ask for information already provided or retrievable by tools
- When clarification is needed: ask minimum questions in ONE message, batch related questions, explain why each is needed
- Maximum 2 clarification rounds before escalation

### 14. Proactive Support Engine

Resolvr doesn't wait for customers to explain — it **detects known issues proactively** by checking customer context before the LLM call:

| Trigger | Detection | Action |
|---------|-----------|--------|
| Shipment delayed past EDD | Order lookup + compare expected date vs. today | Acknowledge delay, provide tracking |
| Refund beyond SLA | Return status + check 5-7 day SLA | Acknowledge delay, provide refund status |
| Repeated delivery failure | Shipment tracking shows 2+ failed attempts | Offer address correction or alternate delivery |
| High-value customer at risk | Customer tier + negative sentiment + open issue | Priority handling, proactive resolution |

```
  Customer: "Hi, I wanted to check on my order"

  [Proactive Checker detects: Order Q2345678 was due 3 days ago, still in transit]

  Bot: "I can see your order Q2345678 was expected to arrive by Feb 19th but
  is currently still in transit with Delhivery. Let me check the latest status
  for you right away..."
```

The customer didn't even need to provide the order number — the proactive checker found it from their history and detected the delay automatically.

### 15. Automated Evaluation Suite

An offline evaluation infrastructure measures VOC pipeline quality across languages, intents, and edge cases:

**50+ curated test cases** across 7 categories:
- Language detection (English, Hindi, Hinglish, Devanagari)
- Entity extraction (order numbers, AWBs, phones, products, amounts)
- Sentiment detection (frustrated, satisfied, neutral, angry, confused)
- Intent accuracy (all L1 intent categories)
- Edge cases (typos, abbreviations, emoji-only, very short messages)
- Resolution quality (receipt completeness, FCR achievement)
- Red-team (prompt injection, PII exfiltration, jailbreak, policy override)

**Target Metrics:**

| Metric | Target |
|--------|--------|
| Intent accuracy | >= 85% |
| Entity recall | >= 80% |
| Entity precision | >= 90% |
| Sentiment accuracy | >= 80% |
| Language detection accuracy | >= 95% |
| First Contact Resolution rate | >= 70% |
| Resolution receipt completeness | >= 90% |
| Hallucination rate | < 5% |
| Avg response latency | < 3s |

### 16. Enterprise PII Governance

Unlike basic regex redaction, Resolvr implements a **4-tier PII classification system** with encrypted tokenized storage, India-specific patterns, and context-aware detection:

**12+ PII Detection Patterns (India-specific + Global):**

| PII Type | Severity | Masking |
|----------|----------|---------|
| Credit/Debit Card | Critical | `XXXX-XXXX-XXXX-{last4}` |
| CVV | Critical | `***` (context-aware: only near card mentions) |
| Bank Account Number | Critical | `XXXXX{last4}` |
| UPI ID (@okaxis, @ybl, @paytm) | Critical | `****@{provider}` |
| Aadhaar Number | Critical | `XXXX-XXXX-{last4}` (Verhoeff check) |
| PAN Card | High | `{first2}XXX{last2}X` |
| Phone (India) | Medium | `+91-XXXXX-{last4}` |
| Email | Medium | `{first2}***@{domain}` |
| Date of Birth | Medium | `XX/XX/XXXX` |
| Payment/Razorpay ID | Medium | `pay_XXX{last4}` |
| Address + PIN Code | Low | Kept (logistics need) |
| IFSC Code | High | Kept (non-sensitive) |

**PII Vault (AES-256-GCM Encrypted):**
- PII tokens (`pii_tok_{uuid}`) — meaningless without vault
- Encrypted at rest with AES-256-GCM
- Severity-based auto-expiry (critical: 5 min, high: 7 days, medium: 30 days, low: 90 days)
- Per-conversation purge on conversation close
- Tools access real values via `detokenize()` — customers never see tokens

**False Positive Prevention:**
- 6-digit PIN codes are NOT flagged as Aadhaar numbers
- 10-digit phone numbers are NOT flagged as bank accounts
- AWB tracking numbers are NOT flagged as bank accounts
- CVV detection requires card number context nearby

**Data Retention & Governance:**

| Data Type | Retention | Storage | Encryption |
|-----------|-----------|---------|------------|
| Card numbers, CVV | Never stored | Redacted in-flight | N/A |
| Bank account, UPI | Auto-purge | PII Vault | AES-256-GCM |
| Aadhaar, PAN | 7 days | PII Vault | AES-256-GCM |
| Phone numbers | 30 days | PII Vault | AES-256-GCM |
| Email addresses | 30 days | Conversation store | At rest |
| Conversation text | 90 days | Conversation store | At rest |
| VOC records | 90 days | VOC store | PII-free |
| Learning summaries | 365 days | Learning store | PII pre-redacted |

---

## Enhancement v2: Enterprise Features

### 17. Agent Co-Pilot Mode

When conversations are escalated, human agents don't work alone — Resolvr's **Co-Pilot** provides real-time AI assistance:

| Feature | Description |
|---------|-------------|
| **Draft Suggestions** | AI generates response drafts based on conversation context and knowledge base |
| **Knowledge Search** | Instant search across FAQs, policies, and escalation matrix — results ranked by relevance |
| **Smart Actions** | One-click actions inferred from context: "Initiate Return", "Generate Payment Link", "Update Address" |
| **Context Panel** | Structured summary: customer profile, order history, conversation timeline, sentiment trajectory |
| **Quality Guardrails** | All suggestions pass governance checks before being shown to agents |

**REST Endpoints:**
- `POST /copilot/suggest` — Generate AI suggestions for a conversation
- `GET /copilot/context/:conversationId` — Build context panel
- `POST /copilot/execute-action` — Execute a smart action
- `POST /copilot/knowledge-search` — Search knowledge base

### 18. SLA Management & Breach Alerting

Every conversation is assigned an SLA tier with automated tracking and breach prediction:

| SLA Tier | First Response Target | Resolution Target | CSAT Target |
|----------|--------------------|-------------------|-------------|
| **Platinum** | 60 seconds | 30 minutes | 4.5 |
| **Gold** | 3 minutes | 1 hour | 4.0 |
| **Silver** | 5 minutes | 2 hours | 3.5 |
| **Bronze** | 10 minutes | 4 hours | 3.0 |

**Automated Tracking:**
- Tier assigned based on customer attributes (LTV, order count, segment)
- Time-to-first-response (TTFR) tracked from conversation start to first bot/agent response
- Time-to-resolution (TTR) tracked from start to resolution
- Breach prediction alerts at 70%, 90%, and 100% thresholds
- SLA dashboard endpoint: `GET /admin/sla/dashboard`

### 19. Order Modification Tools

Three new self-service order modification tools with business rule enforcement:

| Tool | Capability | Safeguards |
|------|-----------|------------|
| **Cancel Order** | Cancel orders in Confirmed/Processing status | Double-confirm protocol, auto-refund for prepaid, eligibility validation |
| **Update Address** | Modify delivery address pre-dispatch | PIN code validation, dispatch status check |
| **Change Payment Method** | Switch between COD and Prepaid | Generates Razorpay payment link for COD→Prepaid conversion |

All three tools share a common eligibility checker with order status validation and automatic audit logging.

### 20. In-Chat Payment Collection

Customers can pay directly within the conversation via **Razorpay** payment links:

```
Customer: "I want to pay for my order online instead of COD"

Bot: "I've generated a secure payment link for ₹2,499.
     Click here to pay: https://rzp.io/i/abc123
     The link is valid for 24 hours."
```

- Payment link generation via `generate_payment_link` tool
- Configurable expiry, amount, currency, and description
- Supports COD-to-prepaid conversion workflows
- Webhook-ready for payment confirmation callbacks

### 21. Omnichannel Conversation Continuity

When a customer switches from WhatsApp to Web Chat (or vice versa), Resolvr **carries their full context** across channels:

```
  WhatsApp Conversation          Web Chat Conversation
  ┌─────────────────┐           ┌─────────────────┐
  │ Order inquiry    │           │ (Same customer)  │
  │ Turn 1-5         │    ──>    │ Continues from   │
  │ Order: DK-12345  │  linked   │ where they left  │
  │ Issue: delayed   │  via      │ off, with full   │
  └─────────────────┘  phone/   │ structured memory│
                        email    └─────────────────┘
```

- **Customer linking** via phone number or email address
- **Context merger** pulls structured memory from previous conversations
- Linked conversation IDs tracked for audit
- Cross-channel switch metric tracked in Prometheus

### 22. Rich Media Responses

Beyond plain text, Resolvr sends **channel-aware rich media** with automatic fallback:

| Media Type | Description | Supported Channels |
|-----------|-------------|-------------------|
| **Product Carousel** | Scrollable product cards with images, prices, CTAs | Web (10 items), WhatsApp (3 items) |
| **Quick Reply Buttons** | Tap-to-reply options for common responses | Web (10 buttons), WhatsApp (3 buttons) |
| **Status Cards** | Order/shipment status with structured display | Web, WhatsApp |
| **Interactive Lists** | Multi-section selection lists | Web, WhatsApp |

Channels that don't support a media type automatically receive a **text fallback** — no broken UIs.

### 23. Customer 360 at Inference Time

Every AI response is informed by the customer's complete profile, loaded from cache and injected into the prompt context:

```
--- CUSTOMER CONTEXT ---
Customer Segment: VIP
Lifetime Value: ₹85,000
Total Orders: 24
Return Rate: 8%
Average CSAT: 4.6
⚡ VIP Customer: Premium support, generous return policies
```

**Personalization rules:**
- VIP customers (LTV > ₹50,000): Priority handling, extended return windows
- High return rate (> 20%): Flag for review, standard policies only
- At-risk customers (dropping CSAT): Proactive retention, escalation preference

### 24. A/B Testing Engine

Test different AI configurations with **hash-based consistent assignment** — the same customer always gets the same variant:

| Feature | Description |
|---------|-------------|
| **Experiment CRUD** | Create, start, pause, stop experiments |
| **Hash-based assignment** | MD5 hash of experiment ID + conversation ID for consistent bucketing |
| **Weighted variants** | Configure traffic split (e.g., 50/50, 80/20) |
| **Override injection** | Variants can override prompt version, model, temperature |
| **Auto-stop** | Automatically stops experiment if degradation threshold exceeded |
| **Per-variant metrics** | Track conversation count, CSAT, resolution rate per variant |

### 25. Outbound Proactive Messaging Engine

Resolvr doesn't just respond — it **proactively reaches out** to customers with governed messaging:

| Trigger | Example | Channel |
|---------|---------|---------|
| Shipment delayed | "Your order is delayed, here's updated tracking" | WhatsApp |
| Refund processed | "Your refund of ₹1,299 has been processed" | WhatsApp/SMS |
| Cart abandoned | "You left items in your cart — need help?" | Web push |
| Review request | "How was your recent purchase?" | WhatsApp |

**Governance Controls:**
- DND (Do Not Disturb) list enforcement
- Quiet hours (9 PM - 9 AM, configurable)
- Maximum 3 messages per customer per day
- Template-based messaging with variable substitution

### 26. GDPR Compliance

Full EU General Data Protection Regulation compliance:

| Right | Implementation | Endpoint |
|-------|---------------|----------|
| **Right to Access** (Art. 15/20) | Export all customer data (conversations, memory, audit trail) as JSON | `POST /admin/gdpr/export` |
| **Right to Erasure** (Art. 17) | Anonymize conversations, purge PII vault, clear structured memory | `POST /admin/gdpr/erase` |

All GDPR operations are logged in the immutable audit trail.

### 27. Immutable Audit Trail

Every system action is logged in a **tamper-evident, SHA-256 chain-hashed** audit trail:

```
Event N:   hash(data + hash_of_event_N-1)  →  "a3f2b8..."
Event N+1: hash(data + "a3f2b8...")         →  "7d4e1c..."
Event N+2: hash(data + "7d4e1c...")         →  "b9f3a2..."
```

| Category | Events Logged |
|----------|--------------|
| **conversation** | Every message processed (intent, state, tools called) |
| **tool_execution** | Every tool call (name, success/failure, duration) |
| **escalation** | Every escalation (trigger, reason, context) |
| **pii_access** | Every PII vault access (detokenize calls) |
| **gdpr** | Data export and erasure operations |
| **order_modification** | Cancel, address update, payment change |

**Integrity verification** endpoint: `GET /admin/audit/verify` — walks the hash chain and confirms no tampering.

### 28. Graceful Degradation & Circuit Breakers

When dependencies fail, Resolvr degrades gracefully instead of crashing:

```
  Dependency     Healthy  →  Degraded  →  Circuit Open  →  Half-Open (probe)
  (e.g., OMS)    ✓✓✓✓✓      ✓✓✗✗         ✗✗✗✗✗ (block)     ✓ (allow one)
```

| Feature | Description |
|---------|-------------|
| **Per-dependency circuit breakers** | 7 dependencies monitored (Redis, OMS, Tracking, Ticketing, LLM, Search, Payment) |
| **Static fallback responses** | Top 10 intents have pre-built responses when LLM is unavailable |
| **Degradation levels** | none → partial → full, based on dependency failure count |
| **Auto-recovery** | Circuits half-open after configurable timeout, probe request tests health |
| **Health endpoint integration** | `/ready` reports per-dependency status and overall degradation level |

### 29. Intelligent Agent Routing

When conversations escalate, Resolvr routes to the **best-fit human agent** based on skills:

| Strategy | How It Works |
|----------|-------------|
| **Skill-based** | Match required skills (language, intent category) to agent skills |
| **Least busy** | Route to agent with fewest active conversations |
| **Round robin** | Distribute evenly across available agents |
| **Priority** | Route urgent cases to most experienced agents |

Agents register their skills (languages, categories), max concurrent conversations, and online status. The router considers all factors to minimize queue time and maximize resolution quality.

### 30. Advanced Security Layers

Three new rate limiting layers beyond the existing per-visitor/per-tenant limits:

| Layer | Protection | Config |
|-------|-----------|--------|
| **Conversation Rate Limiter** | Max conversations per hour per visitor, max messages per conversation | 5 convos/hr, 50 msgs/convo |
| **LLM Cost Limiter** | Token budget per conversation and daily cost budget per tenant | 10K tokens/convo, configurable daily budget |
| **Behavioral Detector** | Detect scripting attacks, harassment, prompt injection, data exfiltration | Pattern matching + frequency analysis |

**9-Category Data Classification Matrix:**

| Category | Sensitivity | Retention | Access |
|----------|-----------|-----------|--------|
| Conversation Content | Medium | 90 days | Agent, System |
| Customer PII | High | 30 days (vault) | System only |
| Payment Data | Critical | Never stored | Tokenized |
| Order Data | Medium | 90 days | Agent, System |
| Agent Notes | Low | 365 days | Agent |
| Audit Trail | Immutable | 365 days | Admin |
| Analytics | Aggregated | 365 days | Admin |
| LLM Prompts | Internal | 90 days | System |
| VOC Records | PII-free | 90 days | System, Admin |

### 31. BI Analytics Dashboard

Real-time analytics across 5 dimensions:

| Dashboard | Metrics |
|-----------|---------|
| **Volume** | Total conversations, messages, by channel, by hour |
| **Deflection** | AI resolution rate, escalation rate, by intent |
| **Resolution** | Average TTR, FCR rate, re-open rate |
| **Cost** | LLM token usage, cost per conversation, cost savings vs. human |
| **Quality** | Average CSAT, NPS, response accuracy, hallucination rate |

**Endpoints:** `GET /admin/analytics/dashboard`, `/volume`, `/deflection`, `/cost`, `/case-study`

### 32. Incident Auto-Detection

Automatically detects operational incidents before they impact customers:

| Detection | Trigger | Action |
|-----------|---------|--------|
| **Error rate spike** | Tool failure rate exceeds 50% in 5-minute window | Create incident, alert ops team |
| **CSAT drop** | Average CSAT drops below 3.0 in rolling window | Create incident, flag for investigation |
| **LLM degradation** | Response latency exceeds 10s or failure rate spikes | Trigger circuit breaker, enable fallbacks |

Active incidents are tracked with severity, timestamps, and auto-resolved when metrics recover.

### 33. In-Chat Shopping Cart

Customers can **add products to cart directly from chat** without leaving the conversation:

| Feature | Description |
|---------|-------------|
| **Add to Cart** | Every product card from search results includes an "Add to Cart" button |
| **Cart Panel** | Slide-out cart panel accessible from header icon with quantity controls (+/−) |
| **Cart Badge** | Real-time badge counter on cart icon showing total items |
| **Cart Summary** | Subtotal, savings, item count rendered inline in chat |
| **Quantity Management** | Increment, decrement, or remove items from the cart panel |
| **Checkout Link** | Direct "Proceed to Checkout" button linking to Dentalkart checkout |
| **Persistence** | Cart stored in localStorage for cross-session persistence |
| **3 Cart Tools** | `add_to_cart`, `view_cart`, `remove_from_cart` — AI can manage cart via conversation |

### 34. Expandable Chat Window

Full-screen immersive chat experience with a single click:

| Feature | Description |
|---------|-------------|
| **Expand/Collapse Toggle** | Header button (⛶/⊟) toggles between widget and full-screen mode |
| **Full Viewport** | Expanded mode uses 100vw × 100vh with no border radius |
| **Responsive Layout** | Product grids, order tables, and messages adapt to expanded width |
| **Wider Tables** | Order tables and shipment cards use 90% width in expanded mode |
| **Product Grid** | Auto-fill grid columns expand to show more products per row |

### 35. Dynamic Order/Shipment Action Buttons

Context-aware action buttons appear based on order and shipment status:

| Status | Buttons Shown |
|--------|---------------|
| **Shipped / In Transit** | 📋 Details, 📦 Track, ❌ Cancel |
| **Processing / Confirmed** | 📋 Details, 📦 Track, ❌ Cancel |
| **Delivered** | 📋 Details, 🔄 Return, 📄 Invoice |
| **Cancelled / Returned** | 📋 Details, 🔁 Reorder |

Buttons appear on **shipment detail cards** after the user clicks an order. Each button auto-triggers the corresponding chat action (cancel, return, track, etc.). Order table rows remain clean and compact — showing only order number, date, status, amount, payment method, and item quantity.

---

## Technical Architecture

### Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js 20+ / TypeScript 5.7 | Type safety, async I/O, ecosystem |
| **HTTP** | Fastify 5 | Fastest Node.js framework, schema validation |
| **AI** | OpenAI SDK, Anthropic SDK, Google GenAI | Multi-provider flexibility |
| **State** | Redis (ioredis) | Sub-millisecond reads, TTL, sorted sets |
| **Metrics** | Prometheus (prom-client) | Industry standard, Grafana compatible |
| **Logging** | Pino | Structured JSON, 30x faster than Winston |
| **Validation** | Ajv | JSON Schema validation for tool arguments |
| **Knowledge** | YAML files | Human-readable, git-diff-friendly, version-controlled |

### 30-Step Message Processing Pipeline

Every inbound message goes through a deterministic 30-step pipeline with VOC intelligence, PII governance, proactive support, and Enhancement v2 features:

```
 1.  Load/create conversation record         (Redis)
 1b. Omnichannel: link customer identity     (Phone/Email → cross-channel merge)
 2.  Create support ticket if new            (Zoho Desk)
 2b. Assign SLA tier                         (Platinum/Gold/Silver/Bronze)
 3.  Append user message to history          (Memory)
 4.  Merge user profile data                 (Structured Memory)
 5.  Send typing indicator                   (Channel)
 5a. VOC Pre-Processing                      (Language, entities, urgency, risk flags)
 5b. PII Scan & Tokenization                 (Classify, tokenize critical PII)
 5c. Proactive Context Check                 (Detect delays, SLA breaches)
 5d. Load Customer 360 Profile               (Cache-backed, personalization rules)
 5e. Resolve A/B Experiment Overrides        (Hash-based variant assignment)
 6.  Call AI engine                           (Multi-LLM + RAG + governance prompt + customer context)
 6a. Graceful degradation fallback           (Static responses if LLM fails)
 6b. Build VOC record                        (Merge pre-processor + LLM signals)
 6c. Save VOC record                         (Async, fire-and-forget)
 6d. Confidence-based routing                (Apply disclaimer or escalate)
 7.  Check escalation thresholds             (10-trigger VOC-enhanced engine)
 8.  Validate and apply state transition     (State Machine)
 9.  Execute tool calls                      (Governed Runtime: cache + circuit breaker + audit)
10.  Merge extracted fields                  (Structured Memory)
11.  Update support ticket                   (Zoho Desk)
12.  Append bot response to history          (Memory)
13.  Track clarification count               (Escalation Logic)
14.  Collect learning data                   (VOC-enriched summaries)
15.  Save conversation record                (Redis, 24hr TTL)
15a. Send response (rich media or text)      (Channel-aware formatting + fallback)
15b. Record SLA first response time          (TTFR tracking)
15c. Check SLA breach thresholds             (Alert at 70%, 90%, 100%)
15d. Log to audit trail                      (SHA-256 chain hashed, fire-and-forget)
15e. Intelligent agent routing               (Skill-based routing on escalation)
```

### Multi-Tenant Architecture

Every aspect of Resolvr is tenant-scoped:

```json
{
  "tenantId": "your-company",
  "enabledTools": ["order_lookup", "track_shipment", ...],
  "channelPolicies": {
    "whatsapp": { "maxTurns": 12, "streaming": false },
    "web": { "maxTurns": 15, "streaming": true }
  },
  "escalationThresholds": {
    "maxClarifications": 2,
    "frustrationKeywords": ["angry", "terrible", ...]
  },
  "featureFlags": {
    "feature.customer_classification": true,
    "feature.return_rate_monitoring": true
  },
  "policyRules": {
    "returnWindowDays": 10,
    "refundTatWorkingDays": "5-7"
  }
}
```

Multiple businesses can run on a single Resolvr instance with completely isolated configurations, tools, policies, and knowledge bases.

### Observability Dashboard

55+ Prometheus metrics for real-time monitoring:

| Category | Metrics |
|----------|---------|
| **HTTP** | Request duration histogram, status codes |
| **AI Engine** | LLM call duration, token usage, failover events, provider breakdown |
| **Tools** | Tool call duration, success/failure, retries, output validation failures, **cache hits/misses** |
| **Conversations** | Active count, state transitions, messages processed |
| **Escalations** | Count by reason, by channel |
| **Session** | Sessions created/ended, CSAT submissions, average rating |
| **Learning** | Pipeline runs, artifacts generated, FAQ candidates pending |
| **Uploads** | File uploads by type |
| **VOC Intelligence** | Pre-processor duration, sentiment distribution, urgency distribution, language distribution, intent confidence histogram, risk flags counter, FCR rate |
| **PII Governance** | PII detections (by type/severity), tokenizations, vault purges |
| **Proactive Support** | Proactive alerts generated (by type) |
| **Enhancement v2** | Webhook duplicates blocked, dependency status (per-dep), fallback responses, Co-Pilot suggestions/acceptance rate, SLA compliance rate, SLA breaches, cross-channel switches, audit events, experiment assignments, outbound messages, routing decisions, active incidents |

All metrics are Grafana-compatible. Health and readiness probes support Kubernetes deployments.

---

## Security

| Layer | Protection |
|-------|-----------|
| **Webhook Auth** | HMAC-SHA256 signature verification on every inbound message |
| **Rate Limiting** | Per-visitor (30/min) and per-tenant (300/min) sliding window |
| **Abuse Detection** | Spam patterns, duplicate flood detection, visitor blocklist |
| **PII Governance** | 12+ India-specific detection patterns, 4-tier severity classification (critical/high/medium/low), context-aware detection with false positive prevention |
| **PII Vault** | AES-256-GCM encrypted tokenized storage, severity-based auto-expiry, per-conversation purge |
| **Anti-Hallucination** | Hybrid RAG confidence thresholds, honest "I don't know" when sources are missing, tool failure transparency |
| **Prompt Injection Defense** | System prompt hardening + red-team evaluation suite (7 injection test cases) |
| **Tool Governance** | Feature flags, channel allowlists, schema validation, rate limits, retry with backoff, output validation |
| **Internal System Names** | Backend system names (VineRetail, Clickpost) never exposed to customers |
| **Admin Auth** | API key authentication for all admin endpoints |
| **Data Retention** | Severity-tiered retention (critical PII: 5 min, conversations: 90 days, learning data: 365 days) |

---

## Deployment Options

### Docker (Recommended)

```
docker-compose up --build    # App + Redis, production-ready
```

### Kubernetes

- Stateless application pods (horizontal scaling)
- Redis cluster for shared state
- Health probes at `/health` (liveness) and `/ready` (readiness)
- Metrics scraping at `/metrics` (Prometheus)
- Graceful shutdown on SIGTERM

### Scaling Profile

| Metric | Specification |
|--------|--------------|
| **Concurrent conversations** | 1000+ per instance |
| **Message latency** | 1-3s (including LLM call) |
| **Horizontal scaling** | Add instances behind load balancer |
| **State consistency** | Redis cluster (shared across instances) |
| **Zero-downtime deploys** | Rolling updates with health checks |

---

## Customization for Your Business

Resolvr is designed to be customized for any e-commerce vertical:

### What You Configure (No Code Changes)

| Aspect | How |
|--------|-----|
| **Products & Catalog** | Update `knowledge/products.yaml` |
| **FAQ Entries** | Update `knowledge/faq.yaml` |
| **Business Policies** | Update `knowledge/policies.yaml` |
| **Escalation Routing** | Update `knowledge/escalation-matrix.yaml` |
| **Brand Voice** | Edit `prompts/brand_tone.md` |
| **Business Rules** | Edit `prompts/developer.md` |
| **Agent Personality** | Edit `prompts/system.md` |
| **Feature Flags** | Toggle in `config/tenants/{id}.json` |
| **Channel Policies** | Configure per-channel in tenant config |
| **Escalation Keywords** | Add to tenant config (supports any language) |
| **Chat Themes** | CSS variables — add custom brand themes |
| **LLM Provider** | Change env vars (zero code change) |
| **Return/Refund Rules** | Update policy rules in tenant config |
| **Support Hours** | Configure per-channel schedules |

### What You Integrate (API Connections)

| Integration Point | Effort | Description |
|-------------------|--------|-------------|
| **Order Management** | Tool adapter | Connect to your OMS (Shopify, Magento, custom) |
| **Shipment Tracking** | Tool adapter | Connect to your logistics (Delhivery, Shiprocket, etc.) |
| **Returns System** | Tool adapter | Connect to your RMA system |
| **Chat Gateway** | Channel adapter | Zoho SalesIQ, Freshchat, Intercom, custom |
| **Ticketing** | Service adapter | Zoho Desk, Freshdesk, Zendesk, custom |
| **CRM** | Tool adapter | Lead creation, customer lookup |

Each integration is a single TypeScript file implementing a typed interface. The tool governance, retry logic, timeout handling, and metrics are handled by the framework.

---

## Case Study: Dentalkart

**Dentalkart** is India's leading online dental products marketplace, serving dentists, clinics, and dental colleges across the country.

### Challenge

- **5,000+ daily customer conversations** across WhatsApp and web chat
- 60% of queries were repetitive (order status, tracking, returns)
- Human agents spending 80% of time on lookups and standard procedures
- Inconsistent return handling leading to customer complaints
- No visibility into conversation patterns or knowledge gaps

### Resolvr Implementation

| Component | Configuration |
|-----------|--------------|
| **Channels** | WhatsApp + Web Chat via Zoho SalesIQ |
| **Backend Tools** | VineRetail (orders), Clickpost (tracking), DK Admin (returns), Product Search |
| **Knowledge Base** | 110+ FAQs, 20 policies, 11 escalation desks |
| **Languages** | English + Hindi + Hinglish |
| **Escalation** | 11 specialized desks with TAT-based routing |
| **AI Engine** | GPT-5.2 primary, Claude Sonnet failover |
| **SOPs** | Customer classification, 5-step return workflow, 6 decision rules |

### Key Capabilities Deployed

- **Real-time order tracking**: Customer says "Where is my order?" → Resolvr looks up order, fetches shipment, tracks courier, responds with status — in one message
- **Automated return processing**: Verifies delivery, checks eligibility against 6 rules, classifies customer type, generates structured return summary
- **Replacement order tracking**: RP- prefix convention links replacement orders to original returns
- **Failed delivery handling**: Detects failed deliveries, identifies reason, suggests re-delivery or address correction
- **11-desk escalation matrix**: Routes complex cases to the right specialist team with full VOC context
- **Hindi/Hinglish VOC intelligence**: Language detection, sentiment analysis, entity extraction, urgency classification across all 3 languages
- **Proactive delay detection**: Automatically detects delayed shipments and refund SLA breaches, acknowledges before customer explains
- **Enterprise PII governance**: Aadhaar, PAN, UPI, card numbers detected and vault-encrypted with India-specific patterns
- **Self-learning with VOC analytics**: 7 analyzers including sentiment trends and VOC quality metrics, with FCR tracking
- **Confidence-based routing**: High-confidence responses go direct, low-confidence escalates — no clarification loops
- **Anti-hallucination guard**: Hybrid RAG with confidence thresholds, honest "I don't know" responses when data is missing

---

## Integration Ecosystem

### Currently Supported

| System | Type | Purpose |
|--------|------|---------|
| **Zoho SalesIQ** | Chat Gateway | WhatsApp, Business Chat, Web Widget |
| **Zoho Desk** | Ticketing | Ticket creation, updates, escalation |
| **OpenAI** | LLM | GPT-5.2 for conversation AI |
| **Anthropic** | LLM | Claude Sonnet for failover |
| **Google** | LLM | Gemini Flash for failover |
| **Redis** | State Store | Conversation memory, session data |
| **Prometheus** | Monitoring | Metrics collection and alerting |
| **VineRetail** | OMS | Order and shipment data |
| **Clickpost** | Logistics | Real-time shipment tracking |

### Extensible To (via adapter pattern)

| Category | Examples |
|----------|---------|
| **Chat Gateways** | Freshchat, Intercom, Twilio, custom WebSocket |
| **Ticketing** | Freshdesk, Zendesk, Jira Service Desk |
| **OMS** | Shopify, Magento, WooCommerce, Unicommerce |
| **Logistics** | Delhivery, Shiprocket, FedEx, DHL |
| **CRM** | Salesforce, HubSpot, Zoho CRM |
| **Payments** | Razorpay, Stripe (for refund status) |

---

## ROI Projection

Based on the Dentalkart reference implementation:

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| **Conversations handled by AI** | 0% | 70-85% | Significant agent headcount reduction |
| **Average response time** | 2-5 minutes | 1-3 seconds | Immediate response, 24/7 |
| **Escalation with context** | Agents start from scratch | Full transcript + memory | Faster resolution |
| **Knowledge base updates** | Manual review | Auto-discovered FAQs | Continuous improvement |
| **Multi-language** | English only | English + Hindi + Hinglish | Broader customer reach |
| **Availability** | Business hours only | 24/7/365 | No missed conversations |
| **LLM vendor risk** | Single provider | 3 providers + failover | Zero downtime |

### How Resolvr Compares

| Capability | Traditional Chatbots | Generic AI Chatbots | **Resolvr** |
|-----------|---------------------|--------------------|----|
| Response quality | Scripted / rule-based | Good but inconsistent | Deterministic + AI hybrid |
| Backend access | None or basic | Limited API calls | 10-step governed tool runtime with retry + validation |
| Context retention | None | Session-only | Structured memory + ticket sync + VOC records |
| Business logic | Decision trees | Prompt-only | State machine + SOP workflows |
| Escalation | Keyword-only | Basic sentiment | 10-trigger VOC-enhanced engine with full context handoff |
| Self-improvement | Manual updates | None | 7 autonomous learning analyzers + VOC analytics |
| LLM flexibility | Single vendor | Single vendor | 3 providers + auto-failover |
| Observability | Basic logs | Basic logs | 40+ Prometheus metrics, structured tracing |
| Multi-tenant | No | Partial | Full isolation (tools, policies, knowledge) |
| Multi-language | Limited | LLM-dependent | Dedicated Hindi/Hinglish + VOC language detection |
| Customer intelligence | None | None | VOC NLU (sentiment, urgency, risk flags, lifecycle stage) |
| PII protection | None or basic | Basic masking | 12+ patterns, 4-tier classification, AES-256-GCM vault |
| Knowledge retrieval | Keyword-only | Basic RAG | Hybrid BM25 + Vector with anti-hallucination guard |
| Proactive support | None | None | Pre-LLM context checking (delays, SLA breaches) |
| Evaluation | Manual testing | None | 50+ automated test cases across 7 categories |
| Confidence routing | None | None | 4-tier confidence matrix with FCR optimization |

---

## Project Structure

```
resolvr/
+-- src/
|   +-- index.ts                    # Entry point
|   +-- app.ts                      # Application wiring
|   +-- config/                     # Environment, types, tenant configs
|   +-- channels/                   # Channel adapters, webhook, chat UI, rich media
|   +-- session/                    # Session store, CSAT, history, customer linker
|   +-- orchestrator/               # State machine, 30-step pipeline
|   +-- agent/                      # Multi-LLM client, prompts, response parsing
|   +-- llm/                        # Provider factory, model router, failover
|   |   +-- providers/              # OpenAI, Anthropic, Gemini implementations
|   +-- tools/                      # Tool registry, governed runtime (retry + cache + validation)
|   |   +-- implementations/        # 19 tool adapters (incl. cart, order mods, payment)
|   +-- cart/                       # In-chat shopping cart service + types
|   +-- voc/                        # VOC Intelligence Engine
|   |   +-- types.ts                # Canonical VOC record, NLU types
|   |   +-- pre-processor.ts        # Fast pre-LLM analysis (<10ms)
|   |   +-- voc-store.ts            # Redis + InMemory VOC storage
|   |   +-- confidence-router.ts    # Confidence-based response routing
|   |   +-- proactive-checker.ts    # Pre-LLM proactive context checking
|   |   +-- evaluation/             # Automated evaluation suite
|   +-- learning/                   # Self-learning pipeline
|   |   +-- analyzers/              # 7 analysis modules (incl. sentiment trends, VOC quality)
|   +-- knowledge/                  # FAQ, policies, escalation matrix
|   |   +-- embedding-service.ts    # OpenAI embeddings provider
|   |   +-- vector-store.ts         # In-memory vector store (cosine similarity)
|   +-- memory/                     # Conversation store (Redis + in-memory)
|   +-- ticketing/                  # Zoho Desk integration
|   +-- observability/              # Logging, 55+ metrics, tracing, PII-aware redaction
|   +-- security/                   # Rate limiting, abuse detection, webhook auth, dedup
|   |   +-- pii-classifier.ts       # 12+ PII patterns, 4-tier classification
|   |   +-- pii-vault.ts            # AES-256-GCM encrypted token vault
|   +-- cache/                      # Tool result caching (Redis + in-memory)
|   +-- audit/                      # Audit trail (SHA-256 chain), GDPR service
|   +-- sla/                        # SLA engine, alerter, tier management
|   +-- copilot/                    # Agent co-pilot, feedback collector
|   +-- customer360/                # Customer 360 profile loader
|   +-- experiment/                 # A/B testing engine
|   +-- outbound/                   # Proactive outbound messaging engine
|   +-- routing/                    # Skill-based intelligent routing
|   +-- resilience/                 # Dependency health, circuit breakers, incident detection
|   +-- analytics/                  # BI analytics engine + routes
|   +-- admin/                      # Admin API endpoints (config, learning, VOC, PII)
|   +-- health/                     # Health + readiness probes (with dependency health)
+-- config/tenants/                 # Tenant configuration files
+-- prompts/                        # Versioned AI prompts
+-- knowledge/                      # YAML knowledge base files
+-- tests/evaluation/               # VOC evaluation test suite (50+ cases)
+-- Dockerfile                      # Multi-stage production build
+-- docker-compose.yml              # App + Redis
```

**~139 TypeScript source files** | **Zero external chatbot framework dependencies** | **Fully typed, fully testable**

---

## Getting Started

### 1. Requirements
- Node.js 20+
- Redis (optional for dev — in-memory fallback included)
- At least one LLM API key (OpenAI, Anthropic, or Gemini)

### 2. Quick Start

```bash
git clone <repo> && cd resolvr
npm install
cp .env.example .env
# Set your LLM API key and admin key in .env
npm run dev
# Open http://localhost:3000
```

### 3. Connect Your Systems
- Add your OMS tool adapter in `src/tools/implementations/`
- Update knowledge base YAML files for your products and policies
- Configure tenant settings in `config/tenants/`
- Set up your chat gateway (Zoho SalesIQ or alternative)

### 4. Deploy

```bash
docker-compose up --build    # Production-ready with Redis
```

---

## Technical Specifications

| Specification | Detail |
|--------------|--------|
| **Language** | TypeScript 5.7 (strict mode) |
| **Runtime** | Node.js 20+ |
| **Framework** | Fastify 5 |
| **AI Providers** | OpenAI, Anthropic, Google (pluggable) |
| **State Store** | Redis 7+ (with in-memory fallback) |
| **Monitoring** | Prometheus + Grafana compatible |
| **Logging** | Structured JSON (Pino) |
| **Deployment** | Docker, Kubernetes, bare metal |
| **Scaling** | Horizontal (stateless app + shared Redis) |
| **Uptime Target** | 99.9% (with multi-LLM failover) |
| **Response Latency** | 1-3 seconds (including LLM call) |
| **Conversation Capacity** | 1000+ concurrent per instance |
| **Knowledge Base** | YAML (hot-reloadable, git-versioned) |
| **Test Coverage** | Unit + Integration test suites |
| **License** | Commercial / Enterprise |

---

*Built with TypeScript. Powered by Multi-LLM AI + VOC Intelligence. Designed for E-Commerce at Scale.*

---

**Contact**: [Your Sales Team Contact Information]

**Demo**: Available on request — see the platform in action with live WhatsApp and web chat conversations.
