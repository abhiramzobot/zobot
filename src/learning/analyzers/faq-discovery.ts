import { v4 as uuid } from 'uuid';
import { ConversationAnalyzer } from './types';
import { ConversationSummary, LearningArtifact, FAQCandidate } from '../types';
import { LearningStore } from '../learning-store';
import { knowledgeService } from '../../knowledge/knowledge-service';
import { logger } from '../../observability/logger';

const MIN_CLUSTER_SIZE = 3; // Minimum occurrences to become a candidate
const SIMILARITY_THRESHOLD = 0.4; // Keyword overlap threshold

/**
 * FAQ Discovery Analyzer
 *
 * Groups similar user messages by keyword overlap, identifies clusters
 * appearing 3+ times that are NOT covered by the existing knowledge base,
 * and generates FAQ candidates with suggested answers.
 */
export class FAQDiscoveryAnalyzer implements ConversationAnalyzer {
  readonly name = 'faq_discovery';
  private log = logger.child({ component: 'faq-discovery' });

  constructor(private readonly store: LearningStore) {}

  async analyze(summaries: ConversationSummary[]): Promise<LearningArtifact[]> {
    const artifacts: LearningArtifact[] = [];

    // 1. Collect all user questions (first message of each conversation is typically the question)
    const questions: Array<{ text: string; conversationId: string; botResponse: string }> = [];

    for (const summary of summaries) {
      if (summary.userMessages.length === 0) continue;

      // First user message is usually the core question
      const question = summary.userMessages[0];
      const botResponse = summary.botMessages[0] ?? '';

      questions.push({
        text: question,
        conversationId: summary.conversationId,
        botResponse,
      });
    }

    if (questions.length < MIN_CLUSTER_SIZE) return artifacts;

    // 2. Cluster similar questions by keyword overlap
    const clusters = this.clusterByKeywords(questions);

    // 3. Filter clusters that meet minimum size and aren't in knowledge base
    const today = new Date().toISOString().slice(0, 10);

    for (const cluster of clusters) {
      if (cluster.items.length < MIN_CLUSTER_SIZE) continue;

      // Check if already in knowledge base
      const representativeQuestion = cluster.items[0].text;
      const knowledgeHit = knowledgeService.buildContext(representativeQuestion);

      if (knowledgeHit && knowledgeHit.length > 50) {
        // Already covered by knowledge base
        continue;
      }

      // Find best bot response (from resolved conversations)
      const resolvedResponses = cluster.items
        .filter((item) => {
          const summary = summaries.find((s) => s.conversationId === item.conversationId);
          return summary?.resolvedByBot;
        })
        .map((item) => item.botResponse)
        .filter(Boolean);

      const suggestedAnswer = resolvedResponses[0] ?? 'Answer needs to be written by the team.';

      // Create FAQ candidate
      const candidate: FAQCandidate = {
        id: uuid(),
        question: representativeQuestion,
        suggestedAnswer: suggestedAnswer.slice(0, 500),
        frequency: cluster.items.length,
        sources: cluster.items.map((i) => i.conversationId),
        status: 'pending',
        category: this.inferCategory(representativeQuestion),
        tags: cluster.keywords,
        createdAt: Date.now(),
      };

      await this.store.saveFAQCandidate(candidate);

      artifacts.push({
        id: uuid(),
        type: 'faq_discovery',
        data: {
          question: representativeQuestion,
          frequency: cluster.items.length,
          keywords: cluster.keywords,
          hasKnowledgeBase: false,
          faqCandidateId: candidate.id,
        },
        createdAt: Date.now(),
        analysisDate: today,
        confidence: Math.min(0.9, cluster.items.length / 10),
      });
    }

    this.log.info({
      questionsAnalyzed: questions.length,
      clustersFound: clusters.length,
      artifactsGenerated: artifacts.length,
    }, 'FAQ discovery analysis complete');

    return artifacts;
  }

  /**
   * Cluster questions by keyword overlap using simple TF-based similarity.
   */
  private clusterByKeywords(
    questions: Array<{ text: string; conversationId: string; botResponse: string }>,
  ): Array<{ items: typeof questions; keywords: string[] }> {
    const clusters: Array<{ items: typeof questions; keywords: string[] }> = [];
    const assigned = new Set<number>();

    for (let i = 0; i < questions.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [questions[i]];
      assigned.add(i);

      const keywordsA = this.extractKeywords(questions[i].text);

      for (let j = i + 1; j < questions.length; j++) {
        if (assigned.has(j)) continue;

        const keywordsB = this.extractKeywords(questions[j].text);
        const similarity = this.keywordOverlap(keywordsA, keywordsB);

        if (similarity >= SIMILARITY_THRESHOLD) {
          cluster.push(questions[j]);
          assigned.add(j);
        }
      }

      clusters.push({ items: cluster, keywords: keywordsA });
    }

    return clusters.sort((a, b) => b.items.length - a.items.length);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'is', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'can', 'may', 'might', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
      'and', 'but', 'or', 'not', 'no', 'so', 'if', 'then', 'than', 'that', 'this', 'these',
      'those', 'it', 'its', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
      'hi', 'hello', 'please', 'want', 'need', 'help', 'get',
      'mera', 'meri', 'mere', 'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'kya', 'kaise',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  private keywordOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 ? intersection / union : 0;
  }

  private inferCategory(question: string): string {
    const lower = question.toLowerCase();
    if (lower.includes('order') || lower.includes('track') || lower.includes('ship')) return 'order_tracking';
    if (lower.includes('return') || lower.includes('refund')) return 'returns_refunds';
    if (lower.includes('cancel')) return 'cancellation';
    if (lower.includes('price') || lower.includes('cost') || lower.includes('discount')) return 'pricing';
    if (lower.includes('product') || lower.includes('available') || lower.includes('stock')) return 'product_info';
    if (lower.includes('warranty') || lower.includes('repair')) return 'warranty';
    if (lower.includes('payment') || lower.includes('pay')) return 'payment';
    return 'general';
  }
}
