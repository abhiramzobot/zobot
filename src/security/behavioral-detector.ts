/**
 * Behavioral Abuse Detector (Phase 4F)
 *
 * Layer 4: scripting, harassment, data exfiltration detection.
 */

import { logger } from '../observability/logger';

export type AbuseType = 'scripting' | 'harassment' | 'data_exfiltration' | 'prompt_injection' | 'spam';

export interface BehavioralAlert {
  type: AbuseType;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  visitorId: string;
  conversationId: string;
  timestamp: number;
}

export class BehavioralDetector {
  private readonly log = logger.child({ component: 'behavioral-detector' });
  private readonly alerts: BehavioralAlert[] = [];

  /** Analyze a message for behavioral abuse patterns */
  analyze(
    text: string,
    visitorId: string,
    conversationId: string,
    turnCount: number,
  ): BehavioralAlert | null {
    // Scripting detection: rapid messages, repeating patterns
    if (this.detectScripting(text, visitorId)) {
      return this.createAlert('scripting', 'medium', 'Automated message pattern detected', visitorId, conversationId);
    }

    // Prompt injection detection
    if (this.detectPromptInjection(text)) {
      return this.createAlert('prompt_injection', 'high', 'Prompt injection attempt', visitorId, conversationId);
    }

    // Data exfiltration detection
    if (this.detectDataExfiltration(text, turnCount)) {
      return this.createAlert('data_exfiltration', 'high', 'Potential data exfiltration', visitorId, conversationId);
    }

    // Harassment detection
    if (this.detectHarassment(text)) {
      return this.createAlert('harassment', 'medium', 'Harassment pattern detected', visitorId, conversationId);
    }

    return null;
  }

  /** Get all alerts */
  getAlerts(since?: number): BehavioralAlert[] {
    if (!since) return [...this.alerts];
    return this.alerts.filter((a) => a.timestamp >= since);
  }

  private detectScripting(text: string, _visitorId: string): boolean {
    // Check for common bot/script patterns
    const scriptPatterns = [
      /^(?:test|ping|hello){3,}/i,
      /^(.{1,20})\1{3,}/,  // Repeating strings
    ];
    return scriptPatterns.some((p) => p.test(text));
  }

  private detectPromptInjection(text: string): boolean {
    const injectionPatterns = [
      /ignore.*previous.*instructions/i,
      /you.*are.*now.*a/i,
      /system.*prompt/i,
      /\bDAN\b.*mode/i,
      /pretend.*you.*are/i,
      /forget.*all.*rules/i,
    ];
    return injectionPatterns.some((p) => p.test(text));
  }

  private detectDataExfiltration(text: string, turnCount: number): boolean {
    // Suspicious data requests after many turns
    if (turnCount < 5) return false;

    const exfilPatterns = [
      /list.*all.*customers/i,
      /dump.*database/i,
      /export.*all.*data/i,
      /show.*all.*orders/i,
      /api.*key/i,
      /internal.*system/i,
    ];
    return exfilPatterns.some((p) => p.test(text));
  }

  private detectHarassment(text: string): boolean {
    // Basic harassment detection — in production use a dedicated ML model
    const harassmentScore = this.countOffensiveWords(text);
    return harassmentScore >= 3;
  }

  private countOffensiveWords(text: string): number {
    // Simplified — real implementation would use a curated list or ML model
    const offensivePatterns = [/\b(idiot|stupid|hate|kill|die|worst)\b/gi];
    let count = 0;
    for (const pattern of offensivePatterns) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }

  private createAlert(
    type: AbuseType,
    severity: BehavioralAlert['severity'],
    evidence: string,
    visitorId: string,
    conversationId: string,
  ): BehavioralAlert {
    const alert: BehavioralAlert = { type, severity, evidence, visitorId, conversationId, timestamp: Date.now() };
    this.alerts.push(alert);
    this.log.warn({ type, severity, visitorId }, evidence);
    return alert;
  }
}
