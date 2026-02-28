/**
 * HTTP Connection Pooling
 *
 * Configures global fetch() to use keep-alive connections,
 * eliminating TCP+TLS handshake overhead on repeated calls.
 *
 * Call initHttpPooling() once at startup (in index.ts).
 * All subsequent fetch() calls globally will reuse connections.
 */

import { logger } from '../observability/logger';

let initialized = false;

/**
 * Initialize global HTTP connection pooling via undici Agent.
 * Node.js 20+ uses undici under the hood for native fetch().
 */
export async function initHttpPooling(): Promise<void> {
  if (initialized) return;

  try {
    // Dynamic import — undici is built into Node.js 20+ but not always exported
    // @ts-expect-error undici is a Node.js 20+ built-in without separate type declarations
    const undici = await import('undici');
    const agent = new undici.Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: 10,
    });
    undici.setGlobalDispatcher(agent);
    initialized = true;
    logger.info('HTTP connection pooling enabled (undici Agent, keepAlive=30s, connections=10)');
  } catch {
    // undici not available (older Node.js or bundled differently) — fall back to no pooling
    logger.warn('undici not available, HTTP connection pooling disabled');
  }
}
