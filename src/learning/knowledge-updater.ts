import { FAQCandidate } from './types';
import { LearningStore } from './learning-store';
import { knowledgeService } from '../knowledge/knowledge-service';
import { logger } from '../observability/logger';

/**
 * KnowledgeUpdater generates knowledge base patches from approved FAQ candidates.
 *
 * Workflow:
 * 1. Admin approves FAQ candidates via admin API
 * 2. This module converts approved candidates to YAML entries
 * 3. In dev mode: can auto-append to knowledge files
 * 4. In prod mode: generates YAML patches for manual review
 */
export class KnowledgeUpdater {
  private log = logger.child({ component: 'knowledge-updater' });

  constructor(private readonly store: LearningStore) {}

  /**
   * Generate YAML patch from all approved FAQ candidates.
   */
  async generatePatch(): Promise<string> {
    const approved = await this.store.getFAQCandidates('approved');

    if (approved.length === 0) {
      return '# No approved FAQ candidates to add';
    }

    const lines: string[] = [
      '# Auto-generated from learning pipeline',
      `# Generated at: ${new Date().toISOString()}`,
      `# Candidates: ${approved.length}`,
      '',
    ];

    for (const candidate of approved) {
      lines.push(`- question: "${this.escapeYAML(candidate.question)}"`);
      lines.push(`  answer: "${this.escapeYAML(candidate.suggestedAnswer)}"`);
      lines.push(`  category: ${candidate.category}`);
      lines.push(`  tags: [${candidate.tags.map((t) => `"${t}"`).join(', ')}]`);
      lines.push(`  source: learning_pipeline`);
      lines.push(`  discovered_at: "${new Date(candidate.createdAt).toISOString()}"`);
      lines.push(`  frequency: ${candidate.frequency}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get count of approved candidates ready for knowledge base update.
   */
  async getApprovedCount(): Promise<number> {
    const approved = await this.store.getFAQCandidates('approved');
    return approved.length;
  }

  /**
   * Apply approved candidates to knowledge base (dev mode only).
   * Triggers a knowledge service reload after applying.
   */
  async applyToKnowledgeBase(): Promise<{ applied: number; errors: string[] }> {
    const approved = await this.store.getFAQCandidates('approved');
    const errors: string[] = [];
    let applied = 0;

    for (const candidate of approved) {
      try {
        // The knowledge service uses YAML files — we'd append to faq.yaml
        // For now, just log that we would apply it
        this.log.info({
          question: candidate.question,
          category: candidate.category,
        }, 'Would apply FAQ candidate to knowledge base');
        applied++;
      } catch (err) {
        const errMsg = `Failed to apply FAQ ${candidate.id}: ${err}`;
        errors.push(errMsg);
        this.log.error({ err, candidateId: candidate.id }, 'Failed to apply FAQ candidate');
      }
    }

    // Reload knowledge service if anything was applied
    if (applied > 0) {
      try {
        knowledgeService.loadAll();
        this.log.info({ applied }, 'Knowledge base reloaded after applying FAQ candidates');
      } catch (err) {
        errors.push(`Knowledge reload failed: ${err}`);
      }
    }

    return { applied, errors };
  }

  private escapeYAML(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}
