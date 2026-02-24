/**
 * Skill-Based Router (Phase 4E)
 *
 * Routes escalations to the best-fit agent.
 */

import { AgentProfile, RoutingDecision, RoutingStrategy } from './types';
import { logger } from '../observability/logger';

export class SkillRouter {
  private readonly agents = new Map<string, AgentProfile>();
  private roundRobinIndex = 0;
  private readonly log = logger.child({ component: 'skill-router' });

  /** Register or update an agent */
  upsertAgent(profile: AgentProfile): void {
    this.agents.set(profile.agentId, profile);
  }

  /** Remove an agent */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /** Route a conversation to an agent */
  route(
    intent: string,
    language: string,
    strategy: RoutingStrategy = 'skill_based',
    priority?: number,
  ): RoutingDecision | null {
    const available = this.getAvailableAgents();
    if (available.length === 0) {
      return null; // No agents available — queue
    }

    switch (strategy) {
      case 'skill_based':
        return this.skillBasedRoute(available, intent, language);
      case 'least_busy':
        return this.leastBusyRoute(available);
      case 'round_robin':
        return this.roundRobinRoute(available);
      case 'priority':
        return this.priorityRoute(available, priority);
      default:
        return this.leastBusyRoute(available);
    }
  }

  /** Get available agents (online + has capacity) */
  getAvailableAgents(): AgentProfile[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.isOnline && a.activeConversations < a.maxConcurrent,
    );
  }

  /** Get queue position estimate */
  getQueuePosition(): { position: number; estimatedWaitSeconds: number } {
    const available = this.getAvailableAgents();
    if (available.length > 0) return { position: 0, estimatedWaitSeconds: 0 };

    // Estimate based on average resolution time (mock: 300s per conversation)
    const totalActive = Array.from(this.agents.values()).reduce((sum, a) => sum + a.activeConversations, 0);
    const avgResolutionTime = 300;
    const estimatedWait = (totalActive / Math.max(this.agents.size, 1)) * avgResolutionTime;

    return { position: totalActive + 1, estimatedWaitSeconds: Math.round(estimatedWait) };
  }

  private skillBasedRoute(agents: AgentProfile[], intent: string, language: string): RoutingDecision {
    // Score agents based on skill match
    const scored = agents.map((agent) => {
      let score = 0;
      for (const skill of agent.skills) {
        if (skill.intents.includes(intent)) score += 10;
        if (skill.languages.includes(language)) score += 5;
      }
      // Penalize busy agents
      score -= agent.activeConversations * 2;
      return { agent, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      agentId: best.agent.agentId,
      reason: `Skill match (score: ${best.score})`,
    };
  }

  private leastBusyRoute(agents: AgentProfile[]): RoutingDecision {
    const sorted = [...agents].sort((a, b) => a.activeConversations - b.activeConversations);
    return { agentId: sorted[0].agentId, reason: 'Least busy' };
  }

  private roundRobinRoute(agents: AgentProfile[]): RoutingDecision {
    const idx = this.roundRobinIndex % agents.length;
    this.roundRobinIndex++;
    return { agentId: agents[idx].agentId, reason: 'Round robin' };
  }

  private priorityRoute(agents: AgentProfile[], _priority?: number): RoutingDecision {
    // For priority routing, use least busy among all agents
    return this.leastBusyRoute(agents);
  }
}
