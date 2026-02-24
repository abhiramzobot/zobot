/**
 * VOC Evaluation Types (Phase 6)
 *
 * Defines test case format, result structure, and evaluation report schema.
 */

/** A single evaluation test case */
export interface EvalCase {
  id: string;
  category: 'intent' | 'entity' | 'sentiment' | 'language' | 'resolution' | 'edge_case' | 'red_team';
  input: {
    message: string;
    /** Optional conversation history context */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    /** Optional structured memory context */
    structuredMemory?: Record<string, unknown>;
  };
  expected: {
    /** Expected primary intent */
    intent?: string;
    /** Expected entities */
    entities?: Array<{ type: string; value: string }>;
    /** Expected sentiment label */
    sentimentLabel?: 'positive' | 'negative' | 'neutral';
    /** Expected language code */
    language?: string;
    /** Should the response include a resolution receipt? */
    hasResolutionReceipt?: boolean;
    /** Should FCR be achieved? */
    fcrAchieved?: boolean;
    /** Should escalation be triggered? */
    shouldEscalate?: boolean;
    /** Response should NOT contain these strings (anti-hallucination) */
    mustNotContain?: string[];
    /** Response MUST contain these strings */
    mustContain?: string[];
  };
  /** Test case description */
  description: string;
  /** Language of the test case */
  language: 'en' | 'hi' | 'hinglish';
  /** Priority: higher priority cases fail the suite if wrong */
  priority: 'critical' | 'high' | 'medium';
}

/** Result of evaluating a single test case */
export interface EvalResult {
  caseId: string;
  category: EvalCase['category'];
  passed: boolean;
  score: number;            // 0-1
  latencyMs: number;
  details: {
    intentMatch?: boolean;
    entityRecall?: number;     // 0-1: what fraction of expected entities were found
    entityPrecision?: number;  // 0-1: what fraction of found entities were correct
    sentimentMatch?: boolean;
    languageMatch?: boolean;
    resolutionReceiptPresent?: boolean;
    fcrMatch?: boolean;
    escalationMatch?: boolean;
    hallucination?: boolean;
    mustContainMatch?: boolean;
    errors?: string[];
  };
}

/** Aggregate evaluation report */
export interface EvalReport {
  runId: string;
  timestamp: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallScore: number;      // 0-1
  latencyAvgMs: number;
  latencyP95Ms: number;

  /** Per-category breakdown */
  categoryScores: Record<string, {
    total: number;
    passed: number;
    avgScore: number;
  }>;

  /** Per-language breakdown */
  languageScores: Record<string, {
    total: number;
    passed: number;
    avgScore: number;
  }>;

  /** Target metrics vs actual */
  metrics: {
    intentAccuracy: number;       // target: >= 0.85
    entityRecall: number;         // target: >= 0.80
    entityPrecision: number;      // target: >= 0.90
    sentimentAccuracy: number;    // target: >= 0.80
    languageDetectionAccuracy: number; // target: >= 0.95
    avgResponseLatencyMs: number; // target: < 3000
    hallucinationRate: number;    // target: < 0.05
    fcrRate: number;              // target: >= 0.70
    resolutionReceiptRate: number; // target: >= 0.90
  };

  /** Failed cases for review */
  failures: EvalResult[];
}
