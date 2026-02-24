import * as fs from 'fs';
import * as path from 'path';
import { TenantConfig, Channel } from './types';
import { logger } from '../observability/logger';

// Resolve from project root (2 levels up from dist/config/ or src/config/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.resolve(PROJECT_ROOT, 'config', 'tenants');

export class ConfigService {
  private configs: Map<string, TenantConfig> = new Map();

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.configs.clear();
    if (!fs.existsSync(CONFIG_DIR)) {
      logger.warn({ dir: CONFIG_DIR }, 'Tenant config directory not found; using built-in default');
      this.configs.set('default', ConfigService.builtInDefault());
      return;
    }

    const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(CONFIG_DIR, file), 'utf-8');
        const cfg = JSON.parse(raw) as TenantConfig;
        this.configs.set(cfg.tenantId, cfg);
        logger.info({ tenantId: cfg.tenantId }, 'Loaded tenant config');
      } catch (err) {
        logger.error({ file, err }, 'Failed to load tenant config');
      }
    }

    if (!this.configs.has('default')) {
      this.configs.set('default', ConfigService.builtInDefault());
    }
  }

  get(tenantId: string): TenantConfig {
    return this.configs.get(tenantId) ?? this.configs.get('default')!;
  }

  getRedacted(tenantId: string): Partial<TenantConfig> {
    const cfg = this.get(tenantId);
    return {
      tenantId: cfg.tenantId,
      enabledTools: cfg.enabledTools,
      channelPolicies: cfg.channelPolicies,
      escalationThresholds: cfg.escalationThresholds,
      promptVersion: cfg.promptVersion,
      featureFlags: cfg.featureFlags,
    };
  }

  isToolEnabled(tenantId: string, toolName: string, channel: Channel): boolean {
    const cfg = this.get(tenantId);
    const globalEnabled = cfg.enabledTools.includes(toolName);
    const channelEnabled = cfg.channelPolicies[channel]?.enabledTools.includes(toolName) ?? false;
    const flagKey = `tool.${toolName}`;
    const flagEnabled = cfg.featureFlags[flagKey] !== false; // default true if not set
    return globalEnabled && channelEnabled && flagEnabled;
  }

  static builtInDefault(): TenantConfig {
    const defaultChannelPolicy = {
      enabledTools: [
        'get_product_info',
        'create_lead',
        'update_lead',
        'create_ticket_note',
        'schedule_meeting',
        'handoff_to_human',
      ],
      maxTurnsBeforeEscalation: 10,
      streamingEnabled: false,
    };

    return {
      tenantId: 'default',
      enabledTools: [
        'get_product_info',
        'create_lead',
        'update_lead',
        'create_ticket_note',
        'schedule_meeting',
        'handoff_to_human',
      ],
      channelPolicies: {
        whatsapp: { ...defaultChannelPolicy, streamingEnabled: false },
        business_chat: { ...defaultChannelPolicy, streamingEnabled: false },
        web: { ...defaultChannelPolicy, streamingEnabled: true },
      },
      escalationThresholds: {
        maxClarifications: 2,
        frustrationKeywords: [
          'frustrated', 'angry', 'useless', 'terrible', 'worst',
          'speak to human', 'real person', 'manager', 'supervisor',
        ],
        escalationIntents: [
          'request_human', 'legal_question', 'contract_negotiation',
          'discount_request', 'complaint',
        ],
      },
      ticketCreationPolicy: {
        autoCreateOnNew: true,
        autoSummarizeOnUpdate: true,
        tagPrefix: 'zobot',
      },
      promptVersion: 'v1',
      featureFlags: {
        'tool.get_product_info': true,
        'tool.create_lead': true,
        'tool.update_lead': true,
        'tool.create_ticket_note': true,
        'tool.schedule_meeting': true,
        'tool.handoff_to_human': true,
        'rag.enabled': false,
      },
    };
  }
}

/** Singleton */
export const configService = new ConfigService();
