import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import {
  FAQEntry,
  ProductEntry,
  PolicyEntry,
  TroubleshootingEntry,
  EscalationEntry,
  KnowledgeSearchResult,
} from './types';
import { logger } from '../observability/logger';
import { EmbeddingProvider } from './embedding-service';
import { VectorStore, VectorEntry } from './vector-store';

// Resolve from project root (2 levels up from dist/knowledge/ or src/knowledge/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const KNOWLEDGE_DIR = path.resolve(PROJECT_ROOT, 'knowledge');

export class KnowledgeService {
  private faq: FAQEntry[] = [];
  private products: ProductEntry[] = [];
  private policies: PolicyEntry[] = [];
  private troubleshooting: TroubleshootingEntry[] = [];
  private escalationMatrix: EscalationEntry[] = [];

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.faq = this.loadYAML<FAQEntry[]>('faq.yaml') ?? [];
    this.products = this.loadYAML<ProductEntry[]>('products.yaml') ?? [];
    this.policies = this.loadYAML<PolicyEntry[]>('policies.yaml') ?? [];
    this.troubleshooting = this.loadYAML<TroubleshootingEntry[]>('troubleshooting.yaml') ?? [];
    this.escalationMatrix = this.loadYAML<EscalationEntry[]>('escalation-matrix.yaml') ?? [];
    logger.info(
      {
        faqCount: this.faq.length,
        productCount: this.products.length,
        policyCount: this.policies.length,
        troubleshootingCount: this.troubleshooting.length,
        escalationDeskCount: this.escalationMatrix.length,
      },
      'Knowledge base loaded',
    );
  }

  private loadYAML<T>(filename: string): T | null {
    const filepath = path.join(KNOWLEDGE_DIR, filename);
    if (!fs.existsSync(filepath)) {
      logger.warn({ filepath }, 'Knowledge file not found');
      return null;
    }
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      return yaml.load(content) as T;
    } catch (err) {
      logger.error({ err, filepath }, 'Failed to load knowledge file');
      return null;
    }
  }

  /**
   * Stop words that dilute search relevance.
   * These common words match almost every knowledge entry and
   * should be filtered out before scoring.
   */
  private static STOP_WORDS = new Set([
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
    'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'about', 'between', 'through', 'during', 'before', 'after',
    'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'then', 'than',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'how', 'when', 'where', 'why',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any', 'no',
    'up', 'out', 'just', 'also', 'very', 'too', 'only',
    'want', 'need', 'know', 'tell', 'please', 'help', 'get',
    // Hindi/Hinglish stop words
    'hai', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'ye', 'wo', 'kya', 'kaise',
    'mera', 'meri', 'mere', 'aap', 'aapka', 'hum', 'humara',
    'kab', 'kahan', 'kaun', 'kitna', 'kitne',
    'ho', 'hota', 'hoti', 'hote', 'tha', 'thi', 'the',
    'par', 'pe', 'bhi', 'nahi', 'nhi', 'ya', 'aur',
    'chahiye', 'chahte', 'chahti', 'karo', 'karna', 'karke',
    'batao', 'bataye', 'bataiye', 'dijiye', 'do',
  ]);

  /**
   * Filter stop words from query terms while preserving meaningful words.
   * If ALL terms are stop words (e.g. "what is it"), fall back to original terms.
   */
  private filterStopWords(terms: string[]): string[] {
    const meaningful = terms.filter((t) => !KnowledgeService.STOP_WORDS.has(t) && t.length > 1);
    return meaningful.length > 0 ? meaningful : terms;
  }

  /**
   * Score a text against meaningful terms.
   * Uses a weighted approach: tag/category exact matches get a bonus.
   */
  private scoreText(text: string, terms: string[], tagText?: string): number {
    if (terms.length === 0) return 0;
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) {
        score += 1;
        // Bonus for tag matches (tags are precise keywords curated for relevance)
        if (tagText && tagText.includes(term)) {
          score += 0.5;
        }
      }
    }
    return score / terms.length;
  }

  /**
   * Keyword-based search across all knowledge sources with stop-word filtering.
   * For production RAG, replace this with vector similarity search.
   */
  search(query: string, topK: number = 5): KnowledgeSearchResult[] {
    const rawTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const terms = this.filterStopWords(rawTerms);
    const results: KnowledgeSearchResult[] = [];

    // Search FAQ
    for (const entry of this.faq) {
      const text = `${entry.question} ${entry.answer} ${entry.tags.join(' ')}`.toLowerCase();
      const tagText = entry.tags.join(' ').toLowerCase();
      const score = this.scoreText(text, terms, tagText);
      if (score > 0.3) {
        results.push({
          type: 'faq',
          content: `Q: ${entry.question}\nA: ${entry.answer}`,
          score,
          source: `faq/${entry.category}`,
        });
      }
    }

    // Search products
    for (const entry of this.products) {
      const text = `${entry.name} ${entry.description} ${(entry.features || []).join(' ')} ${(entry.brands || []).join(' ')}`.toLowerCase();
      const score = this.scoreText(text, terms);
      if (score > 0.3) {
        results.push({
          type: 'product',
          content: `Product: ${entry.name}\n${entry.description}\nFeatures: ${(entry.features || []).join(', ')}${entry.pricing ? `\nPricing: ${entry.pricing}` : ''}`,
          score,
          source: `product/${entry.id}`,
        });
      }
    }

    // Search policies
    for (const entry of this.policies) {
      const text = `${entry.title} ${entry.content}`.toLowerCase();
      const score = this.scoreText(text, terms);
      if (score > 0.3) {
        results.push({
          type: 'policy',
          content: `Policy: ${entry.title}\n${entry.content}`,
          score,
          source: `policy/${entry.id}`,
        });
      }
    }

    // Search troubleshooting
    for (const entry of this.troubleshooting) {
      const issueTexts = entry.issues.map((i) => `${i.issue} ${i.steps.join(' ')}`).join(' ');
      const text = `${entry.product} ${entry.category} ${(entry.applicable_models || []).join(' ')} ${issueTexts} ${entry.notes || ''}`.toLowerCase();
      const score = this.scoreText(text, terms);
      if (score > 0.3) {
        const issuesSummary = entry.issues.map((i) => `• ${i.issue}`).join('\n');
        results.push({
          type: 'troubleshooting',
          content: `Troubleshooting: ${entry.product}\nCategory: ${entry.category}${entry.applicable_models ? `\nModels: ${entry.applicable_models.join(', ')}` : ''}\nIssues:\n${issuesSummary}`,
          score,
          source: `troubleshooting/${entry.id}`,
        });
      }
    }

    // Search escalation matrix
    for (const entry of this.escalationMatrix) {
      const text = `${entry.desk} ${entry.handles.join(' ')} ${entry.alias}`.toLowerCase();
      const score = this.scoreText(text, terms);
      if (score > 0.3) {
        results.push({
          type: 'escalation',
          content: `Escalation Desk: ${entry.desk}\nHandles: ${entry.handles.join(', ')}\nTAT: ${entry.tat}\nContext Required: ${entry.escalation_context_required.join(', ')}`,
          score,
          source: `escalation/${entry.alias}`,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** Build a knowledge context string for the LLM prompt. */
  buildContext(query: string, topK: number = 8): string {
    const results = this.search(query, topK);
    if (results.length === 0) return '';

    return results
      .map((r) => `[Source: ${r.source}]\n${r.content}`)
      .join('\n\n---\n\n');
  }

  getProducts(): ProductEntry[] {
    return this.products;
  }

  searchProducts(query: string): ProductEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    return this.products.filter((p) => {
      const text = `${p.name} ${p.description} ${(p.features || []).join(' ')} ${(p.brands || []).join(' ')}`.toLowerCase();
      return terms.some((t) => text.includes(t));
    });
  }

  /** Look up troubleshooting steps for a specific product. */
  getTroubleshooting(productId: string): TroubleshootingEntry | undefined {
    return this.troubleshooting.find((t) => t.id === productId);
  }

  /** Search troubleshooting by product name or issue description. */
  searchTroubleshooting(query: string): TroubleshootingEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    return this.troubleshooting.filter((t) => {
      const text = `${t.product} ${t.category} ${(t.applicable_models || []).join(' ')} ${t.issues.map((i) => i.issue).join(' ')}`.toLowerCase();
      return terms.some((term) => text.includes(term));
    });
  }

  /** Get the full troubleshooting decision tree for a product and specific issue. */
  getTroubleshootingSteps(productId: string, issueKeyword: string): { product: string; issue: string; steps: string[] } | null {
    const entry = this.troubleshooting.find((t) => t.id === productId);
    if (!entry) return null;

    const normalizedKeyword = issueKeyword.toLowerCase();
    const matchingIssue = entry.issues.find((i) => i.issue.toLowerCase().includes(normalizedKeyword));
    if (!matchingIssue) return null;

    return {
      product: entry.product,
      issue: matchingIssue.issue,
      steps: matchingIssue.steps,
    };
  }

  /** Find the appropriate escalation desk for an issue type. */
  getEscalationDesk(issueType: string): EscalationEntry | undefined {
    const normalizedIssue = issueType.toLowerCase();
    return this.escalationMatrix.find((e) =>
      e.handles.some((h) => h.toLowerCase().includes(normalizedIssue)) ||
      e.alias.toLowerCase().includes(normalizedIssue) ||
      e.desk.toLowerCase().includes(normalizedIssue),
    );
  }

  /** Get all escalation desks. */
  getEscalationMatrix(): EscalationEntry[] {
    return this.escalationMatrix;
  }

  /** Get all troubleshooting entries. */
  getAllTroubleshooting(): TroubleshootingEntry[] {
    return this.troubleshooting;
  }

  // ───── Hybrid Search (BM25 + Vector) ─────────────────────────

  private embeddingProvider?: EmbeddingProvider;
  private vectorStore?: VectorStore;

  /** Set embedding provider for hybrid search (called from app.ts when RAG_ENABLED=true) */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
    this.vectorStore = new VectorStore();
  }

  /** Check if vector search is initialized */
  get isVectorSearchReady(): boolean {
    return !!(this.vectorStore && this.vectorStore.size > 0);
  }

  /**
   * Initialize vector index by batch-embedding all KB documents.
   * Called once on server startup when RAG_ENABLED=true.
   */
  async initializeVectorIndex(): Promise<void> {
    if (!this.embeddingProvider || !this.vectorStore) {
      logger.warn('Cannot initialize vector index: embedding provider not set');
      return;
    }

    const startTime = Date.now();
    this.vectorStore.clear();

    // Collect all documents to embed
    const docs: Array<{ id: string; text: string; type: string; content: string; source: string }> = [];

    for (const entry of this.faq) {
      docs.push({
        id: `faq-${entry.category}-${docs.length}`,
        text: `${entry.question} ${entry.answer} ${entry.tags.join(' ')}`,
        type: 'faq',
        content: `Q: ${entry.question}\nA: ${entry.answer}`,
        source: `faq/${entry.category}`,
      });
    }

    for (const entry of this.products) {
      docs.push({
        id: `product-${entry.id}`,
        text: `${entry.name} ${entry.description} ${(entry.features || []).join(' ')} ${(entry.brands || []).join(' ')}`,
        type: 'product',
        content: `Product: ${entry.name}\n${entry.description}\nFeatures: ${(entry.features || []).join(', ')}${entry.pricing ? `\nPricing: ${entry.pricing}` : ''}`,
        source: `product/${entry.id}`,
      });
    }

    for (const entry of this.policies) {
      docs.push({
        id: `policy-${entry.id}`,
        text: `${entry.title} ${entry.content}`,
        type: 'policy',
        content: `Policy: ${entry.title}\n${entry.content}`,
        source: `policy/${entry.id}`,
      });
    }

    for (const entry of this.troubleshooting) {
      const issueTexts = entry.issues.map((i) => `${i.issue} ${i.steps.join(' ')}`).join(' ');
      docs.push({
        id: `troubleshooting-${entry.id}`,
        text: `${entry.product} ${entry.category} ${(entry.applicable_models || []).join(' ')} ${issueTexts}`,
        type: 'troubleshooting',
        content: `Troubleshooting: ${entry.product}\nCategory: ${entry.category}\nIssues:\n${entry.issues.map((i) => `• ${i.issue}`).join('\n')}`,
        source: `troubleshooting/${entry.id}`,
      });
    }

    for (const entry of this.escalationMatrix) {
      docs.push({
        id: `escalation-${entry.alias}`,
        text: `${entry.desk} ${entry.handles.join(' ')} ${entry.alias}`,
        type: 'escalation',
        content: `Escalation Desk: ${entry.desk}\nHandles: ${entry.handles.join(', ')}\nTAT: ${entry.tat}`,
        source: `escalation/${entry.alias}`,
      });
    }

    if (docs.length === 0) {
      logger.warn('No documents to index for vector search');
      return;
    }

    // Batch embed
    try {
      const texts = docs.map((d) => d.text);
      const embeddings = await this.embeddingProvider.embedBatch(texts);

      const entries: VectorEntry[] = docs.map((doc, i) => ({
        id: doc.id,
        embedding: embeddings[i],
        metadata: {
          type: doc.type,
          content: doc.content,
          source: doc.source,
        },
      }));

      this.vectorStore.addEntries(entries);

      const durationMs = Date.now() - startTime;
      logger.info({ docCount: docs.length, durationMs }, 'Vector index initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize vector index');
    }
  }

  /**
   * Hybrid search: combines keyword (BM25) and vector search using Reciprocal Rank Fusion.
   * Falls back to keyword-only if vector search is not initialized.
   */
  async hybridSearch(query: string, topK: number = 8, alpha: number = 0.5): Promise<KnowledgeSearchResult[]> {
    // Keyword search (always available)
    const keywordResults = this.search(query, topK * 2);

    // Vector search (if available)
    let vectorResults: KnowledgeSearchResult[] = [];
    if (this.embeddingProvider && this.vectorStore && this.vectorStore.size > 0) {
      try {
        const queryEmbedding = await this.embeddingProvider.embed(query);
        vectorResults = this.vectorStore.search(queryEmbedding, topK * 2, 0.6);
      } catch (err) {
        logger.warn({ err }, 'Vector search failed, using keyword-only');
      }
    }

    // If only keyword results, return them directly
    if (vectorResults.length === 0) {
      return keywordResults.slice(0, topK);
    }

    // Reciprocal Rank Fusion (RRF)
    const k = 60; // RRF constant
    const fusedScores = new Map<string, { score: number; result: KnowledgeSearchResult }>();

    // Score keyword results
    keywordResults.forEach((r, rank) => {
      const rrfScore = (1 - alpha) / (k + rank + 1);
      const key = r.source;
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        fusedScores.set(key, { score: rrfScore, result: r });
      }
    });

    // Score vector results
    vectorResults.forEach((r, rank) => {
      const rrfScore = alpha / (k + rank + 1);
      const key = r.source;
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        fusedScores.set(key, { score: rrfScore, result: r });
      }
    });

    // Sort by fused score, return top-K
    return [...fusedScores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((f) => ({ ...f.result, score: f.score }));
  }

  /**
   * Build knowledge context using hybrid search (with source metadata and confidence).
   * Anti-hallucination guard: returns empty if no results meet threshold.
   */
  async buildContextHybrid(query: string, topK: number = 8): Promise<string> {
    const results = await this.hybridSearch(query, topK);

    // Anti-hallucination guard: if no meaningful results, return empty
    if (results.length === 0) return '';

    return results
      .map((r) => `[Source: ${r.source} | Confidence: ${Math.round(r.score * 100)}%]\n${r.content}`)
      .join('\n\n---\n\n');
  }
}

export const knowledgeService = new KnowledgeService();
