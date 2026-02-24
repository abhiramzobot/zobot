/**
 * Business Intelligence Dashboard Types (Phase 3B)
 */

export interface VolumeMetrics {
  totalConversations: number;
  byChannel: Record<string, number>;
  byHour: number[];
  peakHour: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface DeflectionMetrics {
  botResolvedCount: number;
  escalatedCount: number;
  deflectionRate: number;
  topBotResolvedIntents: Array<{ intent: string; count: number }>;
  topEscalatedIntents: Array<{ intent: string; count: number }>;
}

export interface ResolutionMetrics {
  averageResolutionTimeSeconds: number;
  firstContactResolutionRate: number;
  averageTurnsToResolve: number;
  resolutionByState: Record<string, number>;
}

export interface CostMetrics {
  totalTokensUsed: number;
  estimatedCost: number;
  costPerConversation: number;
  costPerResolution: number;
  byProvider: Record<string, { tokens: number; cost: number }>;
}

export interface QualityMetrics {
  averageCsat: number;
  csatDistribution: Record<number, number>;
  averageConfidence: number;
  lowConfidenceRate: number;
  hallucination_rate: number;
}

export interface AnalyticsPeriod {
  since: number;
  until: number;
}

export interface DashboardData {
  period: AnalyticsPeriod;
  volume: VolumeMetrics;
  deflection: DeflectionMetrics;
  resolution: ResolutionMetrics;
  cost: CostMetrics;
  quality: QualityMetrics;
}
