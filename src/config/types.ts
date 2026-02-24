/** Channel identifiers */
export type Channel = 'whatsapp' | 'business_chat' | 'web';

/** Conversation states */
export type ConversationState =
  | 'NEW'
  | 'ACTIVE_QA'
  | 'ORDER_INQUIRY'
  | 'SHIPMENT_TRACKING'
  | 'RETURN_REFUND'
  | 'PRODUCT_INQUIRY'
  | 'LEAD_QUALIFICATION'
  | 'MEETING_BOOKING'
  | 'SUPPORT_TRIAGE'
  | 'ESCALATED'
  | 'RESOLVED';

/** Ticket status */
export type TicketStatus = 'Open' | 'Pending' | 'Escalated' | 'Resolved';

/** Tool auth level */
export type ToolAuthLevel = 'none' | 'service' | 'tenant';

/** Per-tenant channel policy */
export interface ChannelPolicy {
  enabledTools: string[];
  maxTurnsBeforeEscalation: number;
  streamingEnabled: boolean;
}

/** Escalation thresholds */
export interface EscalationThresholds {
  maxClarifications: number;
  frustrationKeywords: string[];
  escalationIntents: string[];
  // VOC-enhanced escalation thresholds (optional for backward compat)
  sentimentEscalationThreshold?: number;      // default: -0.7
  urgencyAutoEscalate?: string[];             // default: ['critical']
  riskFlagAutoEscalate?: string[];            // default: ['legal_threat', 'social_media_threat', 'policy_exception_requested']
}

/** Tenant configuration */
export interface TenantConfig {
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
  // ───── Enhancement v2 Extensions ─────
  coPilotConfig?: {
    enabled: boolean;
    mode: 'auto' | 'suggest' | 'off';
    autoApproveThreshold: number;
    maxSuggestions: number;
  };
  slaConfig?: {
    enabled: boolean;
    defaultTier: 'platinum' | 'gold' | 'silver' | 'bronze';
    alertThresholds: number[];
  };
  outboundConfig?: {
    enabled: boolean;
    maxPerDay: number;
    quietHoursStart: number;
    quietHoursEnd: number;
    defaultChannel: Channel;
  };
  customer360Config?: {
    enabled: boolean;
    cacheTtlSeconds: number;
    vipLtvThreshold: number;
  };
  pricingTier?: 'starter' | 'growth' | 'enterprise';
}

/** Inbound message from any channel */
export interface InboundMessage {
  channel: Channel;
  conversationId: string;
  visitorId: string;
  contactId?: string;
  userProfile: {
    name?: string;
    phone?: string;
    email?: string;
    locale?: string;
    timezone?: string;
    attributes?: Record<string, string>;
  };
  message: {
    text: string;
    attachments?: Array<{
      type: string;
      url: string;
      name?: string;
    }>;
  };
  timestamp: number;
  raw?: Record<string, unknown>;
  tenantId: string;
}

/** Agent response contract */
export interface AgentResponse {
  userFacingMessage: string;
  intent: string;
  extractedFields: Record<string, unknown>;
  shouldEscalate: boolean;
  escalationReason?: string;
  ticketUpdatePayload: {
    summary?: string;
    tags?: string[];
    status?: TicketStatus;
    leadFields?: Record<string, unknown>;
    intentClassification?: string;
  };
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  // ───── VOC Intelligence Fields (optional, from LLM) ─────
  detectedLanguage?: string;
  intentConfidence?: number;
  secondaryIntents?: Array<{ label: string; confidence: number }>;
  sentiment?: { label: string; score: number; emotion?: string };
  extractedEntities?: Array<{ type: string; value: string; confidence: number }>;
  confidenceScore?: number;
  clarificationNeeded?: boolean;
  customerStage?: string;
  // ───── Resolution Engine Fields ─────
  resolutionReceipt?: {
    actionTaken: string;
    referenceId?: string;
    expectedTimeline?: string;
    nextSteps?: string;
  };
  fcrAchieved?: boolean;
  // ───── Rich Media Fields (Enhancement v2) ─────
  responseType?: 'text' | 'rich_media' | 'mixed';
  richMediaPayload?: unknown; // RichMediaPayload type — imported dynamically to avoid circular deps
  quickReplies?: Array<{ label: string; value: string }>;
}

/** Conversation memory turn */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** File attachments sent with this turn */
  attachments?: Array<{
    fileId: string;
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

/** Structured memory (extracted facts) */
export interface StructuredMemory {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  intent?: string;
  productInterest?: string[];
  // Dentalkart e-commerce context
  orderNumbers?: string[];
  awbNumbers?: string[];
  lastOrderStatus?: string;
  issueCategory?: string;   // L1 classification: Order Status, Modify/Cancel, Return/Replace, etc.
  issueSubCategory?: string; // L2/L3 classification
  customFields: Record<string, unknown>;
}

/** Ticket data */
export interface TicketData {
  id?: string;
  conversationId: string;
  channel: Channel;
  subject: string;
  description: string;
  status: TicketStatus;
  tags: string[];
  customFields: Record<string, unknown>;
  summary?: string;
  leadFields?: Record<string, unknown>;
  intentClassification?: string;
  createdAt: number;
  updatedAt: number;
}
