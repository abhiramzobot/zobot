/**
 * SLA Management Types (Phase 2C)
 */

export type SLATier = 'platinum' | 'gold' | 'silver' | 'bronze';

export interface SLATarget {
  tier: SLATier;
  /** Time to first response in seconds */
  ttfrSeconds: number;
  /** Time to resolution in seconds */
  ttrSeconds: number;
  /** Customer satisfaction target (1-5) */
  csatTarget: number;
}

export type SLAStatus = 'on_track' | 'warning' | 'breached';

export interface SLARecord {
  conversationId: string;
  tier: SLATier;
  target: SLATarget;
  /** When SLA clock started */
  startedAt: number;
  /** First response timestamp */
  firstResponseAt?: number;
  /** Resolution timestamp */
  resolvedAt?: number;
  /** Current SLA status */
  status: SLAStatus;
  /** Breach alerts already sent at these percentages */
  alertsSentAt: number[];
}

export interface SLABreachAlert {
  conversationId: string;
  tier: SLATier;
  type: 'ttfr' | 'ttr';
  /** Percentage of SLA consumed (70, 90, 100) */
  percentageConsumed: number;
  remainingSeconds: number;
  message: string;
  timestamp: number;
}

export interface SLADashboard {
  totalConversations: number;
  complianceRate: number;
  breachCount: number;
  averageTTFR: number;
  averageTTR: number;
  byTier: Record<SLATier, { total: number; compliant: number; breached: number }>;
}

export interface SLAConfig {
  enabled: boolean;
  targets: Record<SLATier, SLATarget>;
  /** Alert thresholds as percentages (e.g., [70, 90, 100]) */
  alertThresholds: number[];
  /** Default tier for new conversations */
  defaultTier: SLATier;
}

export interface SLAStore {
  get(conversationId: string): Promise<SLARecord | null>;
  save(record: SLARecord): Promise<void>;
  getActive(): Promise<SLARecord[]>;
  getBreached(since: number): Promise<SLARecord[]>;
}
