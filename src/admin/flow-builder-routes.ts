/**
 * Flow Builder REST Routes (Enhancement v5 — D1)
 *
 * CRUD endpoints for conversation flows.
 * GET/POST/PUT/DELETE /admin/flows
 * Supports Redis persistence with in-memory fallback.
 */

import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { FlowDefinition, FlowStore } from './flow-builder-types';
import { logger } from '../observability/logger';
import Redis from 'ioredis';

const log = logger.child({ component: 'flow-builder-routes' });

// ───── In-Memory Flow Store (fallback) ─────────────────────

class InMemoryFlowStore implements FlowStore {
  private flows = new Map<string, FlowDefinition>();

  async getFlow(id: string): Promise<FlowDefinition | null> {
    return this.flows.get(id) || null;
  }

  async getAllFlows(): Promise<FlowDefinition[]> {
    return Array.from(this.flows.values());
  }

  async saveFlow(flow: FlowDefinition): Promise<void> {
    this.flows.set(flow.id, flow);
  }

  async deleteFlow(id: string): Promise<void> {
    this.flows.delete(id);
  }
}

// ───── Redis Flow Store ────────────────────────────────────

const REDIS_FLOWS_PREFIX = 'zobot:flows:';

class RedisFlowStore implements FlowStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async getFlow(id: string): Promise<FlowDefinition | null> {
    const data = await this.redis.get(`${REDIS_FLOWS_PREFIX}${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllFlows(): Promise<FlowDefinition[]> {
    const keys = await this.redis.keys(`${REDIS_FLOWS_PREFIX}*`);
    if (keys.length === 0) return [];
    const values = await this.redis.mget(...keys);
    return values.filter(Boolean).map((v) => JSON.parse(v!));
  }

  async saveFlow(flow: FlowDefinition): Promise<void> {
    await this.redis.set(`${REDIS_FLOWS_PREFIX}${flow.id}`, JSON.stringify(flow));
  }

  async deleteFlow(id: string): Promise<void> {
    await this.redis.del(`${REDIS_FLOWS_PREFIX}${id}`);
  }
}

// ───── Store Factory ───────────────────────────────────────

let flowStore: FlowStore;

/** Initialize flow store with optional Redis. Called from registerFlowBuilderRoutes. */
function initFlowStore(redis?: Redis): void {
  if (redis) {
    flowStore = new RedisFlowStore(redis);
    log.info('Flow builder using Redis persistence');
  } else {
    flowStore = new InMemoryFlowStore();
    log.info('Flow builder using in-memory store (no Redis)');
  }
  // Seed demo flow
  seedDemoFlow();
}

// ───── Route Registration ──────────────────────────────────

export function registerFlowBuilderRoutes(app: FastifyInstance, redis?: Redis): void {
  // Initialize flow store (Redis if available, in-memory fallback)
  if (!flowStore) initFlowStore(redis);
  const verifyAdmin = (req: any, reply: any): boolean => {
    const { env } = require('../config/env');
    const key = req.headers['x-admin-api-key'] as string | undefined;
    if (!key || key !== env.security.adminApiKey) {
      reply.status(403).send({ error: 'Forbidden' });
      return false;
    }
    return true;
  };

  // List all flows
  app.get('/admin/flows', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const flows = await flowStore.getAllFlows();
    return reply.send({
      status: 'ok',
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isActive: f.isActive,
        nodeCount: f.nodes.length,
        edgeCount: f.edges.length,
        triggerIntent: f.triggerIntent,
        updatedAt: f.updatedAt,
      })),
      count: flows.length,
    });
  });

  // Get single flow
  app.get('/admin/flows/:flowId', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const { flowId } = req.params as { flowId: string };
    const flow = await flowStore.getFlow(flowId);
    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' });
    }
    return reply.send({ status: 'ok', flow });
  });

  // Create new flow
  app.post('/admin/flows', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const body = req.body as Partial<FlowDefinition>;

    const flow: FlowDefinition = {
      id: `flow_${uuid().substring(0, 8)}`,
      name: body.name || 'Untitled Flow',
      description: body.description || '',
      version: '1.0.0',
      isActive: body.isActive ?? false,
      triggerIntent: body.triggerIntent,
      triggerKeywords: body.triggerKeywords || [],
      nodes: body.nodes || [],
      edges: body.edges || [],
      variables: body.variables || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'admin',
    };

    await flowStore.saveFlow(flow);
    log.info({ flowId: flow.id, name: flow.name }, 'Flow created');
    return reply.status(201).send({ status: 'ok', flow });
  });

  // Update flow
  app.put('/admin/flows/:flowId', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const { flowId } = req.params as { flowId: string };
    const existing = await flowStore.getFlow(flowId);
    if (!existing) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    const body = req.body as Partial<FlowDefinition>;
    const updated: FlowDefinition = {
      ...existing,
      ...body,
      id: flowId, // Preserve ID
      updatedAt: Date.now(),
    };

    await flowStore.saveFlow(updated);
    log.info({ flowId, name: updated.name }, 'Flow updated');
    return reply.send({ status: 'ok', flow: updated });
  });

  // Delete flow
  app.delete('/admin/flows/:flowId', async (req, reply) => {
    if (!verifyAdmin(req, reply)) return;
    const { flowId } = req.params as { flowId: string };
    const existing = await flowStore.getFlow(flowId);
    if (!existing) {
      return reply.status(404).send({ error: 'Flow not found' });
    }

    await flowStore.deleteFlow(flowId);
    log.info({ flowId, name: existing.name }, 'Flow deleted');
    return reply.send({ status: 'ok', message: `Flow "${existing.name}" deleted` });
  });

  log.info('Flow builder routes registered');
}

// ───── Demo Flow Seed ──────────────────────────────────────

function seedDemoFlow(): void {
  const demoFlow: FlowDefinition = {
    id: 'flow_welcome',
    name: 'Welcome & Product Help',
    description: 'Default greeting flow that guides customers to products or support',
    version: '1.0.0',
    isActive: true,
    triggerIntent: 'greeting',
    triggerKeywords: ['hello', 'hi', 'help', 'start'],
    nodes: [
      {
        id: 'node_1',
        type: 'greeting',
        label: 'Welcome',
        position: { x: 100, y: 100 },
        config: {
          greetingMessage: 'Hello! Welcome to Dentalkart. How can I help you today?',
        },
      },
      {
        id: 'node_2',
        type: 'question',
        label: 'What do you need?',
        position: { x: 100, y: 250 },
        config: {
          questionText: 'What would you like help with?',
          variableName: 'help_type',
          inputType: 'choice',
          choices: ['Browse Products', 'Track Order', 'Get Support', 'Bulk/B2B Order'],
        },
      },
      {
        id: 'node_3',
        type: 'condition',
        label: 'Route by choice',
        position: { x: 100, y: 400 },
        config: {
          conditionType: 'variable',
          conditionField: 'help_type',
          conditionOperator: 'equals',
          conditionValue: 'Browse Products',
        },
      },
      {
        id: 'node_4',
        type: 'tool_call',
        label: 'Search Products',
        position: { x: -100, y: 550 },
        config: {
          toolName: 'search_products',
          toolArgs: { query: '{{user_query}}' },
        },
      },
      {
        id: 'node_5',
        type: 'tool_call',
        label: 'Lookup Orders',
        position: { x: 300, y: 550 },
        config: {
          toolName: 'lookup_customer_orders',
          toolArgs: {},
        },
      },
      {
        id: 'node_6',
        type: 'escalation',
        label: 'Escalate',
        position: { x: 500, y: 550 },
        config: {
          escalationReason: 'Customer requested human support',
          department: 'General Support',
        },
      },
    ],
    edges: [
      { id: 'edge_1', source: 'node_1', target: 'node_2' },
      { id: 'edge_2', source: 'node_2', target: 'node_3' },
      { id: 'edge_3', source: 'node_3', target: 'node_4', label: 'Browse Products', condition: 'true' },
      { id: 'edge_4', source: 'node_3', target: 'node_5', label: 'Track Order', condition: 'false' },
      { id: 'edge_5', source: 'node_2', target: 'node_6', label: 'Get Support' },
    ],
    variables: [
      { name: 'help_type', type: 'string', description: 'Customer selected help type' },
      { name: 'user_query', type: 'string', description: 'Search query from customer' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: 'system',
  };

  flowStore.saveFlow(demoFlow);
}
