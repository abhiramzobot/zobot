import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import {
  ConversationSummary,
  LearningArtifact,
  LearningArtifactType,
  FAQCandidate,
  FAQCandidateStatus,
} from './types';
import { logger } from '../observability/logger';

// ─── Interface ────────────────────────────────────────────────────

export interface LearningStore {
  // Conversation summaries
  saveSummary(summary: ConversationSummary): Promise<void>;
  getSummaries(since: number, limit?: number): Promise<ConversationSummary[]>;
  getSummaryCount(since: number): Promise<number>;

  // Learning artifacts
  saveArtifact(artifact: LearningArtifact): Promise<void>;
  getArtifacts(type: LearningArtifactType, since?: number): Promise<LearningArtifact[]>;

  // FAQ candidates
  saveFAQCandidate(candidate: FAQCandidate): Promise<void>;
  getFAQCandidates(status?: FAQCandidateStatus): Promise<FAQCandidate[]>;
  updateFAQCandidateStatus(id: string, status: FAQCandidateStatus): Promise<void>;
}

// ─── In-Memory Implementation (Development) ──────────────────────

export class InMemoryLearningStore implements LearningStore {
  private summaries: ConversationSummary[] = [];
  private artifacts: LearningArtifact[] = [];
  private faqCandidates: Map<string, FAQCandidate> = new Map();

  async saveSummary(summary: ConversationSummary): Promise<void> {
    this.summaries.push(summary);
  }

  async getSummaries(since: number, limit = 1000): Promise<ConversationSummary[]> {
    return this.summaries
      .filter((s) => s.endedAt >= since)
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, limit);
  }

  async getSummaryCount(since: number): Promise<number> {
    return this.summaries.filter((s) => s.endedAt >= since).length;
  }

  async saveArtifact(artifact: LearningArtifact): Promise<void> {
    this.artifacts.push(artifact);
  }

  async getArtifacts(type: LearningArtifactType, since?: number): Promise<LearningArtifact[]> {
    return this.artifacts
      .filter((a) => a.type === type && (!since || a.createdAt >= since))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveFAQCandidate(candidate: FAQCandidate): Promise<void> {
    this.faqCandidates.set(candidate.id, candidate);
  }

  async getFAQCandidates(status?: FAQCandidateStatus): Promise<FAQCandidate[]> {
    const all = Array.from(this.faqCandidates.values());
    if (!status) return all;
    return all.filter((c) => c.status === status);
  }

  async updateFAQCandidateStatus(id: string, status: FAQCandidateStatus): Promise<void> {
    const candidate = this.faqCandidates.get(id);
    if (candidate) {
      candidate.status = status;
    }
  }
}

// ─── Redis Implementation (Production) ───────────────────────────

const KEY_PREFIX = 'zobot:learning:';
const SUMMARY_TTL = 90 * 24 * 60 * 60; // 90 days

export class RedisLearningStore implements LearningStore {
  private log = logger.child({ component: 'redis-learning-store' });

  constructor(private readonly redis: Redis) {}

  async saveSummary(summary: ConversationSummary): Promise<void> {
    const dateKey = new Date(summary.endedAt).toISOString().slice(0, 10);
    const key = `${KEY_PREFIX}summaries:${dateKey}`;
    const member = JSON.stringify(summary);

    await this.redis.zadd(key, summary.endedAt, member);
    await this.redis.expire(key, SUMMARY_TTL);
  }

  async getSummaries(since: number, limit = 1000): Promise<ConversationSummary[]> {
    // Scan date keys within range
    const now = Date.now();
    const summaries: ConversationSummary[] = [];
    const dates = this.getDateRange(since, now);

    for (const date of dates) {
      const key = `${KEY_PREFIX}summaries:${date}`;
      const members = await this.redis.zrangebyscore(key, since, '+inf', 'LIMIT', 0, limit);

      for (const member of members) {
        try {
          summaries.push(JSON.parse(member) as ConversationSummary);
        } catch {
          this.log.warn({ key }, 'Failed to parse summary from Redis');
        }
      }

      if (summaries.length >= limit) break;
    }

    return summaries.sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
  }

  async getSummaryCount(since: number): Promise<number> {
    const now = Date.now();
    let count = 0;
    const dates = this.getDateRange(since, now);

    for (const date of dates) {
      const key = `${KEY_PREFIX}summaries:${date}`;
      count += await this.redis.zcount(key, since, '+inf');
    }

    return count;
  }

  async saveArtifact(artifact: LearningArtifact): Promise<void> {
    const key = `${KEY_PREFIX}artifacts:${artifact.type}`;
    await this.redis.zadd(key, artifact.createdAt, JSON.stringify(artifact));
    await this.redis.expire(key, SUMMARY_TTL);
  }

  async getArtifacts(type: LearningArtifactType, since?: number): Promise<LearningArtifact[]> {
    const key = `${KEY_PREFIX}artifacts:${type}`;
    const min = since ?? 0;
    const members = await this.redis.zrangebyscore(key, min, '+inf');

    return members.map((m) => {
      try {
        return JSON.parse(m) as LearningArtifact;
      } catch {
        return null;
      }
    }).filter(Boolean) as LearningArtifact[];
  }

  async saveFAQCandidate(candidate: FAQCandidate): Promise<void> {
    const key = `${KEY_PREFIX}faq:${candidate.id}`;
    await this.redis.set(key, JSON.stringify(candidate), 'EX', SUMMARY_TTL);

    // Also add to index set
    await this.redis.sadd(`${KEY_PREFIX}faq:index`, candidate.id);
  }

  async getFAQCandidates(status?: FAQCandidateStatus): Promise<FAQCandidate[]> {
    const ids = await this.redis.smembers(`${KEY_PREFIX}faq:index`);
    const candidates: FAQCandidate[] = [];

    for (const id of ids) {
      const raw = await this.redis.get(`${KEY_PREFIX}faq:${id}`);
      if (!raw) continue;

      try {
        const candidate = JSON.parse(raw) as FAQCandidate;
        if (!status || candidate.status === status) {
          candidates.push(candidate);
        }
      } catch {
        this.log.warn({ id }, 'Failed to parse FAQ candidate');
      }
    }

    return candidates;
  }

  async updateFAQCandidateStatus(id: string, status: FAQCandidateStatus): Promise<void> {
    const key = `${KEY_PREFIX}faq:${id}`;
    const raw = await this.redis.get(key);
    if (!raw) return;

    try {
      const candidate = JSON.parse(raw) as FAQCandidate;
      candidate.status = status;
      await this.redis.set(key, JSON.stringify(candidate), 'EX', SUMMARY_TTL);
    } catch {
      this.log.warn({ id }, 'Failed to update FAQ candidate status');
    }
  }

  private getDateRange(sinceMs: number, untilMs: number): string[] {
    const dates: string[] = [];
    const current = new Date(sinceMs);
    const end = new Date(untilMs);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }
}

// ─── Factory ──────────────────────────────────────────────────────

export function createLearningStore(redis?: Redis): LearningStore {
  if (redis) {
    logger.info('Using Redis-backed learning store');
    return new RedisLearningStore(redis);
  }
  logger.info('Using in-memory learning store (development)');
  return new InMemoryLearningStore();
}
