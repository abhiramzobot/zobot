/**
 * Embedding Service — Abstraction for text embedding providers.
 *
 * Uses OpenAI text-embedding-3-small by default.
 * Provides batch embedding for KB initialization and single-query embedding for search.
 */

import { env } from '../config/env';
import { logger } from '../observability/logger';

export interface EmbeddingProvider {
  /** Embed a single text string */
  embed(text: string): Promise<number[]>;
  /** Batch embed multiple text strings */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Embedding dimension */
  dimension: number;
}

/**
 * OpenAI-compatible embedding provider.
 * Works with OpenAI text-embedding-3-small (1536 dimensions).
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 1536;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = env.openai.apiKey;
    this.model = env.rag.embeddingModel;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured for embeddings');
    }

    const batchSize = 100; // OpenAI supports up to 2048, but keep requests manageable
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'OpenAI embedding API error');
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        allEmbeddings.push(item.embedding);
      }
    }

    return allEmbeddings;
  }
}
