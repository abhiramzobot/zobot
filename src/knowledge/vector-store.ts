/**
 * In-Memory Vector Store — Cosine similarity search for knowledge base.
 *
 * Designed for small KBs (~200 entries, ~80KB).
 * Stores pre-computed embeddings and performs brute-force cosine similarity.
 * For production scale, replace with pgvector, Pinecone, or Qdrant.
 */

import { KnowledgeSearchResult } from './types';

export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: {
    type: string;
    content: string;
    source: string;
  };
}

export class VectorStore {
  private entries: VectorEntry[] = [];

  /** Add entries to the vector store */
  addEntries(entries: VectorEntry[]): void {
    this.entries.push(...entries);
  }

  /** Clear all entries (for re-indexing) */
  clear(): void {
    this.entries = [];
  }

  /** Get entry count */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Search by cosine similarity.
   * Returns top-K results above the minimum threshold.
   */
  search(queryEmbedding: number[], topK: number = 5, minScore: number = 0.6): KnowledgeSearchResult[] {
    if (this.entries.length === 0) return [];

    const scored = this.entries.map((entry) => ({
      entry,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    return scored
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => ({
        type: s.entry.metadata.type as KnowledgeSearchResult['type'],
        content: s.entry.metadata.content,
        score: s.score,
        source: s.entry.metadata.source,
      }));
  }

  /** Compute cosine similarity between two vectors */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}
