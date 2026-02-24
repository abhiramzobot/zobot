import { logger } from '../observability/logger';

const SPAM_PATTERNS = [
  /(.)\1{10,}/,               // repeated characters aaaaaaaaaa
  /https?:\/\/\S+/gi,         // URLs in messages (potential phishing)
  /\b(buy|click|free|winner|congratulations)\b/gi, // spam keywords
];

const BLOCKLIST: Set<string> = new Set();

export class AbuseDetector {
  private messageHistory: Map<string, { texts: string[]; timestamps: number[] }> = new Map();
  private readonly duplicateWindowMs = 10_000;
  private readonly duplicateThreshold = 3;

  /**
   * Returns true if the message is classified as abusive/spam.
   */
  check(visitorId: string, text: string): { blocked: boolean; reason?: string } {
    // Blocklist check
    if (BLOCKLIST.has(visitorId)) {
      return { blocked: true, reason: 'blocklisted' };
    }

    // Empty or extremely long messages
    if (!text.trim()) {
      return { blocked: true, reason: 'empty_message' };
    }
    if (text.length > 5000) {
      return { blocked: true, reason: 'message_too_long' };
    }

    // Spam pattern detection
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(text)) {
        logger.warn({ visitorId, pattern: pattern.source }, 'Spam pattern detected');
        // Don't block on URL alone — just flag. Block on repeated chars.
        if (pattern.source.includes('(.)\\1')) {
          return { blocked: true, reason: 'spam_pattern' };
        }
      }
    }

    // Duplicate flood detection
    const now = Date.now();
    let history = this.messageHistory.get(visitorId);
    if (!history) {
      history = { texts: [], timestamps: [] };
      this.messageHistory.set(visitorId, history);
    }

    // Purge old entries
    while (history.timestamps.length > 0 && now - history.timestamps[0] > this.duplicateWindowMs) {
      history.timestamps.shift();
      history.texts.shift();
    }

    history.texts.push(text);
    history.timestamps.push(now);

    const duplicates = history.texts.filter((t) => t === text).length;
    if (duplicates >= this.duplicateThreshold) {
      logger.warn({ visitorId, duplicates }, 'Duplicate flood detected');
      return { blocked: true, reason: 'duplicate_flood' };
    }

    return { blocked: false };
  }

  addToBlocklist(visitorId: string): void {
    BLOCKLIST.add(visitorId);
    logger.info({ visitorId }, 'Added to blocklist');
  }

  removeFromBlocklist(visitorId: string): void {
    BLOCKLIST.delete(visitorId);
  }
}

export const abuseDetector = new AbuseDetector();
