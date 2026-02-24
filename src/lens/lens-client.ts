/**
 * Zoho Lens API Client
 *
 * Handles OAuth 2.0 authentication and all Zoho Lens REST API v2 calls.
 * Supports: create session, end session, get user info, reports.
 *
 * API Docs: https://www.zoho.com/lens/resources/api/introduction.html
 */

import { logger } from '../observability/logger';
import {
  ZohoLensConfig,
  ZohoOAuthTokens,
  LensSessionCreateParams,
  LensSessionCreateResponse,
  LensSessionEndResponse,
  LensUserInfo,
  LensReportParams,
  LensReportResponse,
  ActiveARSession,
  LensSessionStore,
  ARSessionStatus,
} from './types';

const log = logger.child({ module: 'zoho-lens' });

// ───── In-Memory Session Store ─────────────────────────────

class InMemoryLensSessionStore implements LensSessionStore {
  private sessions = new Map<string, ActiveARSession>();

  getSession(visitorId: string): ActiveARSession | null {
    const session = this.sessions.get(visitorId);
    if (!session) return null;
    // Auto-expire sessions older than 1 hour
    if (Date.now() - session.createdAt > 3600000) {
      this.sessions.delete(visitorId);
      return null;
    }
    return session;
  }

  saveSession(session: ActiveARSession): void {
    this.sessions.set(session.visitorId, session);
  }

  removeSession(visitorId: string): void {
    this.sessions.delete(visitorId);
  }

  getAllActive(): ActiveARSession[] {
    const now = Date.now();
    const active: ActiveARSession[] = [];
    for (const [key, session] of this.sessions) {
      if (now - session.createdAt > 3600000) {
        this.sessions.delete(key);
      } else if (session.status === 'active' || session.status === 'creating') {
        active.push(session);
      }
    }
    return active;
  }
}

// ───── Zoho Lens Client ────────────────────────────────────

export class ZohoLensClient {
  private config: ZohoLensConfig;
  private tokens: ZohoOAuthTokens | null = null;
  private sessionStore: LensSessionStore;
  private userInfo: LensUserInfo | null = null;

  constructor(config: ZohoLensConfig, sessionStore?: LensSessionStore) {
    this.config = config;
    this.sessionStore = sessionStore || new InMemoryLensSessionStore();
  }

  // ───── OAuth 2.0 Token Management ─────────────────────

  /**
   * Get a valid access token, refreshing if expired.
   * Access tokens are valid for 1 hour.
   */
  private async getAccessToken(): Promise<string> {
    // Check if current token is still valid (with 5-minute buffer)
    if (this.tokens && this.tokens.expiresAt > Date.now() + 300000) {
      return this.tokens.accessToken;
    }

    log.info('Refreshing Zoho Lens OAuth access token');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(`${this.config.accountsUrl}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'OAuth token refresh failed');
      throw new Error(`Zoho OAuth refresh failed: ${response.status} — ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    this.tokens = {
      accessToken: String(data.access_token),
      tokenType: String(data.token_type || 'Bearer'),
      expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
    };

    log.info({ expiresIn: data.expires_in }, 'Zoho Lens OAuth token refreshed');
    return this.tokens.accessToken;
  }

  /**
   * Generic API call with OAuth header
   */
  private async apiCall<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    let url = `${this.config.baseUrl}/api/v2${path}`;
    if (queryParams) {
      const qs = new URLSearchParams(queryParams);
      url += `?${qs.toString()}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ method, path, status: response.status, error: errorText }, 'Zoho Lens API error');
      throw new Error(`Zoho Lens API ${method} ${path}: ${response.status} — ${errorText}`);
    }

    return (await response.json()) as T;
  }

  // ───── Session Management ─────────────────────────────

  /**
   * Create a new AR remote assistance session.
   * Returns technician URL and customer join URL.
   */
  async createSession(params: LensSessionCreateParams): Promise<LensSessionCreateResponse> {
    const deptId = params.departmentId || this.config.departmentId;

    log.info({ title: params.title, departmentId: deptId }, 'Creating Zoho Lens AR session');

    const queryParams: Record<string, string> = {
      department_id: deptId,
      title: params.title,
    };

    const result = await this.apiCall<LensSessionCreateResponse>(
      'POST',
      '/lens_session',
      undefined,
      queryParams,
    );

    log.info({
      customerJoinUrl: result.representation.customer_join_url,
      title: params.title,
    }, 'Zoho Lens AR session created');

    return result;
  }

  /**
   * End an active AR session.
   * Only session owner or org super admin can end sessions.
   */
  async endSession(sessionId: string): Promise<LensSessionEndResponse> {
    log.info({ sessionId }, 'Ending Zoho Lens AR session');

    const result = await this.apiCall<LensSessionEndResponse>(
      'POST',
      '/session/end',
      { session_id: sessionId },
    );

    log.info({ sessionId, status: result.representation.status }, 'Zoho Lens session ended');
    return result;
  }

  // ───── User Info ──────────────────────────────────────

  /**
   * Get authenticated user/technician info.
   * Also caches orgId and department info.
   */
  async getUserInfo(): Promise<LensUserInfo> {
    if (this.userInfo) return this.userInfo;

    const result = await this.apiCall<{ representation: LensUserInfo }>('GET', '/user');
    this.userInfo = result.representation;

    // Cache org ID for future calls
    if (this.userInfo.org?.orgId) {
      this.config.orgId = this.userInfo.org.orgId;
    }

    log.info({
      zuid: this.userInfo.zuid,
      role: this.userInfo.role?.roleKey,
      edition: this.userInfo.license?.edition,
      departments: this.userInfo.departments?.length,
    }, 'Zoho Lens user info loaded');

    return this.userInfo;
  }

  // ───── Reports ────────────────────────────────────────

  /**
   * Get session reports with optional filters.
   */
  async getReports(params?: LensReportParams): Promise<LensReportResponse> {
    const queryParams: Record<string, string> = { type: params?.type || 'LS' };
    if (params?.fromDate) queryParams.fromdate = String(params.fromDate);
    if (params?.toDate) queryParams.todate = String(params.toDate);
    if (params?.email) queryParams.email = params.email;
    if (params?.index !== undefined) queryParams.index = String(params.index);
    if (params?.count !== undefined) queryParams.count = String(params.count);

    return this.apiCall<LensReportResponse>('GET', '/reports', undefined, queryParams);
  }

  // ───── High-Level Session Workflow ────────────────────

  /**
   * Create an AR demo session and track it in the session store.
   * This is the primary method used by the start_ar_demo tool.
   */
  async startARDemo(
    visitorId: string,
    conversationId: string,
    title: string,
    productId?: string | number,
    productName?: string,
  ): Promise<ActiveARSession> {
    // Check for existing active session
    const existing = this.sessionStore.getSession(visitorId);
    if (existing && (existing.status === 'active' || existing.status === 'creating')) {
      log.warn({ visitorId, existingSession: existing.sessionId }, 'Active AR session already exists');
      return existing;
    }

    // Create session via API
    const result = await this.createSession({ title });

    // Extract session key from URLs
    const customerUrl = result.representation.customer_join_url;
    const sessionKey = customerUrl.split('/join/')[1] || '';

    // Build full technician URL
    const techUrl = `${this.config.baseUrl}${result.representation.technician_url}`;

    // Track session
    const session: ActiveARSession = {
      sessionId: sessionKey,
      visitorId,
      conversationId,
      productId,
      productName,
      title,
      technicianUrl: techUrl,
      customerJoinUrl: customerUrl,
      status: 'active' as ARSessionStatus,
      createdAt: Date.now(),
    };

    this.sessionStore.saveSession(session);

    log.info({
      sessionId: sessionKey,
      visitorId,
      productName,
      customerJoinUrl: customerUrl,
    }, 'AR demo session started and tracked');

    return session;
  }

  /**
   * End an AR demo session for a visitor.
   */
  async endARDemo(visitorId: string): Promise<{ ended: boolean; message: string }> {
    const session = this.sessionStore.getSession(visitorId);
    if (!session) {
      return { ended: false, message: 'No active AR session found.' };
    }

    try {
      await this.endSession(session.sessionId);
      session.status = 'ended';
      session.endedAt = Date.now();
      this.sessionStore.saveSession(session);

      // Clean up after a brief delay
      setTimeout(() => this.sessionStore.removeSession(visitorId), 5000);

      return { ended: true, message: 'AR session ended successfully.' };
    } catch (err) {
      log.error({ err, sessionId: session.sessionId }, 'Failed to end AR session via API');
      // Still mark as ended locally
      session.status = 'ended';
      session.endedAt = Date.now();
      this.sessionStore.saveSession(session);
      this.sessionStore.removeSession(visitorId);
      return { ended: true, message: 'AR session ended.' };
    }
  }

  /**
   * Get current AR session for a visitor (if any).
   */
  getActiveSession(visitorId: string): ActiveARSession | null {
    return this.sessionStore.getSession(visitorId);
  }

  /**
   * Get all active AR sessions (for admin dashboard).
   */
  getAllActiveSessions(): ActiveARSession[] {
    return this.sessionStore.getAllActive();
  }

  /**
   * Check if the Lens client is properly configured.
   */
  isConfigured(): boolean {
    return !!(
      this.config.enabled &&
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.refreshToken &&
      this.config.departmentId
    );
  }
}

// ───── Singleton Management ────────────────────────────────

let lensClient: ZohoLensClient | null = null;

export function initLensClient(config: ZohoLensConfig): ZohoLensClient {
  lensClient = new ZohoLensClient(config);
  log.info({ enabled: config.enabled, baseUrl: config.baseUrl }, 'Zoho Lens client initialized');
  return lensClient;
}

export function getLensClient(): ZohoLensClient | null {
  return lensClient;
}
