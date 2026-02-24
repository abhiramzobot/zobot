/**
 * Zoho Lens — Augmented Reality Remote Assistance
 *
 * Type definitions for the Zoho Lens REST API v2.
 * Integrates AR product demos, visual guidance, and remote assistance
 * directly into the customer service chatbot.
 *
 * API Reference: https://www.zoho.com/lens/resources/api/introduction.html
 */

// ───── Authentication ──────────────────────────────────────

export interface ZohoLensConfig {
  enabled: boolean;
  baseUrl: string;               // https://lens.zoho.com
  accountsUrl: string;           // https://accounts.zoho.com
  clientId: string;
  clientSecret: string;
  refreshToken: string;          // Long-lived, never expires until revoked
  departmentId: string;          // Default department for session creation
  orgId?: string;                // Organization ID (auto-fetched via /user)
  technicianEmail?: string;      // Default technician for sessions
}

export interface ZohoOAuthTokens {
  accessToken: string;
  tokenType: string;             // "Bearer"
  expiresAt: number;             // Unix timestamp (ms) when token expires
}

// ───── Session Management ──────────────────────────────────

export interface LensSessionCreateParams {
  departmentId?: string;         // Falls back to config.departmentId
  title: string;                 // Session title (product name / demo context)
}

export interface LensSessionCreateResponse {
  representation: {
    technician_url: string;      // Relative path: /lens-viewer?x-com-zoho-lens-orgid=...&key=...
    customer_join_url: string;   // Full URL: https://lens.zoho.com/join/...
    session_key?: string;        // Session key extracted from URLs
  };
  resource_type: string;         // "/api/v2/lens_session" or "/api/v2/session/lens"
}

export interface LensSessionEndParams {
  sessionId: string;
}

export interface LensSessionEndResponse {
  resource_type: string;         // "end"
  representation: {
    status: boolean;
  };
}

// ───── Session Scheduling ──────────────────────────────────

export interface LensSessionScheduleParams {
  departmentId?: string;
  title: string;
  scheduledTime: number;         // Unix timestamp
  customerEmail?: string;
  customerPhone?: string;
  notifyCustomer?: boolean;
}

// ───── User / Technician Info ──────────────────────────────

export interface LensUserInfo {
  zuid: string;
  role: {
    roleId: string;
    isEditable: boolean;
    roleKey: string;             // "TECHNICIAN", "ADMIN", etc.
    permissions: string[];
    accessibleModules: string[];
  };
  org: {
    orgId: string;
    orgName: string;
  };
  license: {
    isTrial: boolean;
    licenseType: 'FREE' | 'TRIAL' | 'LICENSED';
    remainingDays: number;
    edition: 'FREE' | 'STANDARD' | 'PROFESSIONAL';
  };
  departments: Array<{
    departmentId: string;
    name: string;
    displayName: string;
    isSystemGenerated: boolean;
  }>;
  preferredDepartment: string;
}

// ───── Reports ─────────────────────────────────────────────

export interface LensReportParams {
  type?: string;                 // "LS" for Lens sessions
  fromDate?: number;             // Unix timestamp
  toDate?: number;               // Unix timestamp
  email?: string;                // Filter by technician email
  index?: number;                // Pagination
  count?: number;                // Rows per page
}

export interface LensSessionReport {
  session_id: string;
  session_type: string;
  session_title: string;
  agent_email: string;
  agent_os: string;
  agent_ipaddress: string;
  viewer_email: string;
  viewer_os: string;
  viewer_ipaddress: string;
  start_time: number;            // Unix timestamp
  end_time: number;              // Unix timestamp
  duration: number;              // Milliseconds
  display_name: string;
  session_owner_email: string;
  geo_location: Array<{
    role: string;
    email: string;
    latitude: number;
    longitude: number;
  }>;
}

export interface LensReportResponse {
  total_count: number;
  response_params: LensSessionReport[];
}

// ───── In-Chat AR Session State ────────────────────────────

export type ARSessionStatus = 'creating' | 'active' | 'ended' | 'expired' | 'error';

export interface ActiveARSession {
  sessionId: string;
  visitorId: string;
  conversationId: string;
  productId?: string | number;
  productName?: string;
  title: string;
  technicianUrl: string;
  customerJoinUrl: string;
  status: ARSessionStatus;
  createdAt: number;
  endedAt?: number;
}

// ───── Tool Input/Output Types ─────────────────────────────

export interface StartARDemoInput {
  product_name: string;
  product_id?: string | number;
  demo_type?: 'product_demo' | 'troubleshooting' | 'installation_guide' | 'visual_inspection';
  customer_email?: string;
  customer_phone?: string;
  schedule_time?: string;        // ISO 8601 format for scheduling
}

export interface StartARDemoOutput {
  sessionStarted: boolean;
  customerJoinUrl: string;
  sessionTitle: string;
  demoType: string;
  message: string;
  instructions: string;
}

export interface EndARSessionOutput {
  ended: boolean;
  message: string;
}

// ───── Lens Client Store (session tracking) ────────────────

export interface LensSessionStore {
  getSession(visitorId: string): ActiveARSession | null;
  saveSession(session: ActiveARSession): void;
  removeSession(visitorId: string): void;
  getAllActive(): ActiveARSession[];
}
