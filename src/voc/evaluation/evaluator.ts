/**
 * VOC Evaluator (Phase 6)
 *
 * Runs evaluation test cases through the VOC pre-processor and agent,
 * compares outputs against expected results, and generates a report.
 */

import { v4 as uuid } from 'uuid';
import { EvalCase, EvalResult, EvalReport } from './types';
import { VOCPreProcessor } from '../pre-processor';
import { AgentCore } from '../../agent/agent-core';
import { AgentResponse, Channel } from '../../config/types';
import { logger } from '../../observability/logger';

export class VOCEvaluator {
  private log = logger.child({ component: 'voc-evaluator' });

  constructor(
    private readonly preProcessor: VOCPreProcessor,
    private readonly agent?: AgentCore,
  ) {}

  /**
   * Run the full evaluation suite.
   */
  async evaluate(cases: EvalCase[], runLLM: boolean = false): Promise<EvalReport> {
    const runId = uuid();
    const results: EvalResult[] = [];

    this.log.info({ caseCount: cases.length, runLLM }, 'Starting VOC evaluation');

    for (const evalCase of cases) {
      try {
        const result = await this.evaluateCase(evalCase, runLLM);
        results.push(result);
      } catch (err) {
        this.log.error({ err, caseId: evalCase.id }, 'Evaluation case failed');
        results.push({
          caseId: evalCase.id,
          category: evalCase.category,
          passed: false,
          score: 0,
          latencyMs: 0,
          details: { errors: [err instanceof Error ? err.message : 'Unknown error'] },
        });
      }
    }

    return this.buildReport(runId, results, cases);
  }

  private async evaluateCase(evalCase: EvalCase, runLLM: boolean): Promise<EvalResult> {
    const start = Date.now();
    const details: EvalResult['details'] = {};
    const errors: string[] = [];
    let score = 0;
    let checks = 0;

    // 1. Run pre-processor
    const vocResult = this.preProcessor.process(evalCase.input.message, {
      turnCount: (evalCase.input.history?.length ?? 0) + 1,
      clarificationCount: 0,
      previousIntents: [],
    });

    // 2. Optionally run LLM agent
    let agentResponse: AgentResponse | undefined;
    if (runLLM && this.agent) {
      const history = (evalCase.input.history ?? []).map((h, i) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
        timestamp: Date.now() - (1000 * (evalCase.input.history!.length - i)),
      }));
      agentResponse = await this.agent.process(
        evalCase.input.message,
        history,
        (evalCase.input.structuredMemory ?? { customFields: {} }) as any,
        'web' as Channel,
      );
    }

    // 3. Evaluate language detection
    if (evalCase.expected.language) {
      checks++;
      const detectedLang = vocResult.detectedLanguages[0]?.code;
      details.languageMatch = detectedLang === evalCase.expected.language;
      if (details.languageMatch) score++;
      else errors.push(`Language: expected '${evalCase.expected.language}', got '${detectedLang}'`);
    }

    // 4. Evaluate entities
    if (evalCase.expected.entities && evalCase.expected.entities.length > 0) {
      checks++;
      const expectedEntities = evalCase.expected.entities;
      const detectedEntities = vocResult.entities;

      // Entity recall: how many expected entities were found?
      let found = 0;
      for (const expected of expectedEntities) {
        const match = detectedEntities.find(
          (d) => d.type === expected.type && d.value === expected.value,
        );
        if (match) found++;
      }
      details.entityRecall = expectedEntities.length > 0 ? found / expectedEntities.length : 1;

      // Entity precision: how many detected entities are correct?
      let correct = 0;
      for (const detected of detectedEntities) {
        const match = expectedEntities.find(
          (e) => e.type === detected.type && e.value === detected.value,
        );
        if (match) correct++;
      }
      details.entityPrecision = detectedEntities.length > 0 ? correct / detectedEntities.length : 1;

      if (details.entityRecall >= 0.8) score++;
      else errors.push(`Entity recall: ${(details.entityRecall * 100).toFixed(0)}% < 80%`);
    }

    // 5. Evaluate intent (requires LLM)
    if (evalCase.expected.intent && agentResponse) {
      checks++;
      details.intentMatch = agentResponse.intent === evalCase.expected.intent;
      if (details.intentMatch) score++;
      else errors.push(`Intent: expected '${evalCase.expected.intent}', got '${agentResponse.intent}'`);
    }

    // 6. Evaluate sentiment (requires LLM)
    if (evalCase.expected.sentimentLabel && agentResponse?.sentiment) {
      checks++;
      details.sentimentMatch = agentResponse.sentiment.label === evalCase.expected.sentimentLabel;
      if (details.sentimentMatch) score++;
      else errors.push(`Sentiment: expected '${evalCase.expected.sentimentLabel}', got '${agentResponse.sentiment.label}'`);
    }

    // 7. Evaluate escalation (requires LLM)
    if (evalCase.expected.shouldEscalate !== undefined && agentResponse) {
      checks++;
      details.escalationMatch = agentResponse.shouldEscalate === evalCase.expected.shouldEscalate;
      if (details.escalationMatch) score++;
      else errors.push(`Escalation: expected ${evalCase.expected.shouldEscalate}, got ${agentResponse.shouldEscalate}`);
    }

    // 8. Evaluate resolution receipt (requires LLM)
    if (evalCase.expected.hasResolutionReceipt !== undefined && agentResponse) {
      checks++;
      details.resolutionReceiptPresent = !!agentResponse.resolutionReceipt;
      if (details.resolutionReceiptPresent === evalCase.expected.hasResolutionReceipt) score++;
      else errors.push(`Resolution receipt: expected ${evalCase.expected.hasResolutionReceipt}, got ${details.resolutionReceiptPresent}`);
    }

    // 9. Evaluate FCR (requires LLM)
    if (evalCase.expected.fcrAchieved !== undefined && agentResponse) {
      checks++;
      details.fcrMatch = agentResponse.fcrAchieved === evalCase.expected.fcrAchieved;
      if (details.fcrMatch) score++;
      else errors.push(`FCR: expected ${evalCase.expected.fcrAchieved}, got ${agentResponse.fcrAchieved}`);
    }

    // 10. Anti-hallucination check
    if (evalCase.expected.mustNotContain && agentResponse) {
      checks++;
      const message = agentResponse.userFacingMessage.toLowerCase();
      const hallucinated = evalCase.expected.mustNotContain.some(
        (s) => message.includes(s.toLowerCase()),
      );
      details.hallucination = hallucinated;
      if (!hallucinated) score++;
      else errors.push(`Hallucination: response contained forbidden content`);
    }

    // 11. Must-contain check
    if (evalCase.expected.mustContain && agentResponse) {
      checks++;
      const message = agentResponse.userFacingMessage.toLowerCase();
      const allPresent = evalCase.expected.mustContain.every(
        (s) => message.includes(s.toLowerCase()),
      );
      details.mustContainMatch = allPresent;
      if (allPresent) score++;
      else errors.push(`MustContain: response missing required content`);
    }

    if (errors.length > 0) details.errors = errors;

    const latencyMs = Date.now() - start;
    const finalScore = checks > 0 ? score / checks : 1;

    return {
      caseId: evalCase.id,
      category: evalCase.category,
      passed: finalScore >= 0.8 || (evalCase.priority === 'critical' ? finalScore === 1 : finalScore >= 0.7),
      score: Math.round(finalScore * 100) / 100,
      latencyMs,
      details,
    };
  }

  private buildReport(runId: string, results: EvalResult[], cases: EvalCase[]): EvalReport {
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);
    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

    // Category scores
    const categoryScores: EvalReport['categoryScores'] = {};
    for (const result of results) {
      if (!categoryScores[result.category]) {
        categoryScores[result.category] = { total: 0, passed: 0, avgScore: 0 };
      }
      const cat = categoryScores[result.category];
      cat.total++;
      if (result.passed) cat.passed++;
      cat.avgScore += result.score;
    }
    for (const cat of Object.values(categoryScores)) {
      cat.avgScore = cat.total > 0 ? Math.round((cat.avgScore / cat.total) * 100) / 100 : 0;
    }

    // Language scores
    const languageScores: EvalReport['languageScores'] = {};
    for (let i = 0; i < results.length; i++) {
      const lang = cases[i].language;
      if (!languageScores[lang]) {
        languageScores[lang] = { total: 0, passed: 0, avgScore: 0 };
      }
      const ls = languageScores[lang];
      ls.total++;
      if (results[i].passed) ls.passed++;
      ls.avgScore += results[i].score;
    }
    for (const ls of Object.values(languageScores)) {
      ls.avgScore = ls.total > 0 ? Math.round((ls.avgScore / ls.total) * 100) / 100 : 0;
    }

    // Aggregate metrics
    const intentResults = results.filter((r) => r.details.intentMatch !== undefined);
    const entityRecalls = results.filter((r) => r.details.entityRecall !== undefined);
    const entityPrecisions = results.filter((r) => r.details.entityPrecision !== undefined);
    const sentimentResults = results.filter((r) => r.details.sentimentMatch !== undefined);
    const langResults = results.filter((r) => r.details.languageMatch !== undefined);
    const hallucinationResults = results.filter((r) => r.details.hallucination !== undefined);
    const fcrResults = results.filter((r) => r.details.fcrMatch !== undefined);
    const receiptResults = results.filter((r) => r.details.resolutionReceiptPresent !== undefined);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const rate = (arr: EvalResult[], pred: (r: EvalResult) => boolean) =>
      arr.length > 0 ? arr.filter(pred).length / arr.length : 0;

    return {
      runId,
      timestamp: Date.now(),
      totalCases: results.length,
      passedCases: passed.length,
      failedCases: failed.length,
      overallScore: Math.round(avg(results.map((r) => r.score)) * 100) / 100,
      latencyAvgMs: Math.round(avg(latencies)),
      latencyP95Ms: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
      categoryScores,
      languageScores,
      metrics: {
        intentAccuracy: Math.round(rate(intentResults, (r) => r.details.intentMatch === true) * 100) / 100,
        entityRecall: Math.round(avg(entityRecalls.map((r) => r.details.entityRecall!)) * 100) / 100,
        entityPrecision: Math.round(avg(entityPrecisions.map((r) => r.details.entityPrecision!)) * 100) / 100,
        sentimentAccuracy: Math.round(rate(sentimentResults, (r) => r.details.sentimentMatch === true) * 100) / 100,
        languageDetectionAccuracy: Math.round(rate(langResults, (r) => r.details.languageMatch === true) * 100) / 100,
        avgResponseLatencyMs: Math.round(avg(latencies)),
        hallucinationRate: Math.round(rate(hallucinationResults, (r) => r.details.hallucination === true) * 100) / 100,
        fcrRate: Math.round(rate(fcrResults, (r) => r.details.fcrMatch === true) * 100) / 100,
        resolutionReceiptRate: Math.round(rate(receiptResults, (r) => r.details.resolutionReceiptPresent === true) * 100) / 100,
      },
      failures: failed,
    };
  }
}
