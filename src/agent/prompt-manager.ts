import * as fs from 'fs';
import * as path from 'path';
import { PromptBundle } from './types';
import { logger } from '../observability/logger';

// Resolve from project root (2 levels up from dist/agent/ or src/agent/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PROMPTS_DIR = path.resolve(PROJECT_ROOT, 'prompts');

interface VersionsFile {
  versions: Record<string, {
    system: string;
    developer: string;
    brandTone: string;
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  }>;
  default: string;
}

export class PromptManager {
  private bundles: Map<string, PromptBundle> = new Map();
  private defaultVersion: string = 'v1';

  constructor() {
    this.loadAll();
  }

  loadAll(): void {
    this.bundles.clear();

    const versionsPath = path.join(PROMPTS_DIR, 'versions.json');
    if (!fs.existsSync(versionsPath)) {
      logger.warn('prompts/versions.json not found; building default bundle from markdown files');
      this.loadFallbackBundle();
      return;
    }

    try {
      const raw = fs.readFileSync(versionsPath, 'utf-8');
      const versionsFile = JSON.parse(raw) as VersionsFile;
      this.defaultVersion = versionsFile.default;

      for (const [version, meta] of Object.entries(versionsFile.versions)) {
        if (!meta.approved) {
          logger.warn({ version }, 'Prompt version not approved; skipping');
          continue;
        }

        const bundle: PromptBundle = {
          version,
          system: this.readPromptFile(meta.system),
          developer: this.readPromptFile(meta.developer),
          brandTone: this.readPromptFile(meta.brandTone),
          governance: this.readPromptFile('governance.md'),
        };
        this.bundles.set(version, bundle);
        logger.info({ version, approved: meta.approved }, 'Loaded prompt bundle');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to load prompt versions');
      this.loadFallbackBundle();
    }
  }

  private readPromptFile(filename: string): string {
    const filepath = path.join(PROMPTS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      logger.warn({ filepath }, 'Prompt file not found');
      return '';
    }
    return fs.readFileSync(filepath, 'utf-8');
  }

  private loadFallbackBundle(): void {
    const bundle: PromptBundle = {
      version: 'v1',
      system: this.readPromptFile('system.md'),
      developer: this.readPromptFile('developer.md'),
      brandTone: this.readPromptFile('brand_tone.md'),
      governance: this.readPromptFile('governance.md'),
    };
    this.bundles.set('v1', bundle);
    this.defaultVersion = 'v1';
  }

  get(version?: string): PromptBundle {
    const v = version ?? this.defaultVersion;
    const bundle = this.bundles.get(v);
    if (!bundle) {
      logger.warn({ version: v }, 'Prompt version not found; using default');
      return this.bundles.get(this.defaultVersion) ?? {
        version: 'fallback',
        system: 'You are a helpful assistant.',
        developer: '',
        brandTone: '',
      };
    }
    return bundle;
  }

  getDefault(): PromptBundle {
    return this.get(this.defaultVersion);
  }
}

export const promptManager = new PromptManager();
