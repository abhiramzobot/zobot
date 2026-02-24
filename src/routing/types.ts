/**
 * Intelligent Agent Routing Types (Phase 4E)
 */

export interface AgentSkill {
  id: string;
  name: string;
  /** Intents this skill handles */
  intents: string[];
  /** Languages supported */
  languages: string[];
}

export interface AgentProfile {
  agentId: string;
  name: string;
  skills: AgentSkill[];
  /** Current active conversations */
  activeConversations: number;
  /** Max concurrent conversations */
  maxConcurrent: number;
  isOnline: boolean;
  lastActiveAt: number;
}

export interface RoutingDecision {
  agentId: string;
  reason: string;
  queuePosition?: number;
  estimatedWaitSeconds?: number;
}

export type RoutingStrategy = 'round_robin' | 'skill_based' | 'least_busy' | 'priority';
