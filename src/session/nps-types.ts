/**
 * NPS / Follow-up Types (Phase 4C)
 */

export interface NPSSubmission {
  id: string;
  conversationId: string;
  visitorId: string;
  /** NPS score 0-10 */
  score: number;
  /** Detractor (0-6), Passive (7-8), Promoter (9-10) */
  category: 'detractor' | 'passive' | 'promoter';
  feedback?: string;
  submittedAt: number;
}

export interface NPSSurveyConfig {
  enabled: boolean;
  /** Hours after resolution to send follow-up */
  followUpDelayHours: number;
  /** How often to send NPS surveys (days) */
  npsFrequencyDays: number;
}

export interface FollowUpTask {
  id: string;
  conversationId: string;
  visitorId: string;
  type: 'csat_followup' | 'nps_survey' | 'resolution_check';
  scheduledAt: number;
  completedAt?: number;
  status: 'pending' | 'sent' | 'completed' | 'skipped';
}

export function categorizeNPS(score: number): NPSSubmission['category'] {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'passive';
  return 'promoter';
}
