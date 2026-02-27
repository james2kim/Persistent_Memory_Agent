/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom Evaluators for LangSmith Experiments
 *
 * Evaluators check if agent responses and traces meet expected criteria.
 * Each evaluator returns a score, and can be marked as critical (must-pass).
 */

/**
 * Drop-in evaluator improvements (trace-first, backward-compatible)
 */

import type { SmokeTestCase, ExpectedBehavior, Category } from './dataset';
import type { AgentTrace } from '../schemas/types';

export interface EvaluationResult {
  key: string;
  score: number;
  weight: number;
  critical: boolean;
  comment?: string;
}

export interface AgentOutput {
  response: string;
  trace?: AgentTrace;
  gateDecision?: {
    shouldRetrieveDocuments: boolean;
    shouldRetrieveMemories: boolean;
    needsClarification: boolean;
    reasoning: string;
  };
}

// -----------------------------
// Helpers
// -----------------------------

type ExpectedRetrieval = 'required' | 'optional' | 'forbidden';

const getExpectedRetrieval = (testCase: SmokeTestCase): ExpectedRetrieval | undefined => {
  // Backward-compatible: only use if you add it to dataset later.
  const val = (testCase as any).expected_retrieval as ExpectedRetrieval | undefined;
  if (val === 'required' || val === 'optional' || val === 'forbidden') return val;
  return undefined;
};

const safeLower = (s: string) => (s ?? '').toLowerCase();

const findSpan = (trace: AgentTrace | undefined, node: string) =>
  trace?.spans?.find((s) => s.node === node);

const getNumberMeta = (span: any, key: string): number | undefined => {
  const raw = span?.meta?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
};

const detectBehaviorFromText = (response: string): ExpectedBehavior => {
  const lower = safeLower(response);

  const refusalPatterns = [
    "i'm a study assistant",
    "i'm an ai study assistant",
    "i'm an ai assistant focused on study",
    "i'm an academic study assistant",
    'focused on study-related',
    'focused on providing study-related',
    'primarily focused on providing study',
    "i'm focused on providing study",
    "don't have expertise in",
    "aren't really my area",
    'outside my main area',
    "i'm afraid stock",
    "i'm afraid fashion",
    "i'm afraid clothing",
    'i do not have expertise',
    "i'm focused on providing study-related assistance",
    'may not be the best resource',
    "i can't advise on that",
    'not my area of expertise',
    "isn't really my area",
    "isn't really my specialty",
    'not really my area',
    'outside my expertise',
    'outside my area',
    'outside my core domain',
    "can't advise on",
    'i apologize, but',
    'better equipped to help with study',
    "food preferences aren't",
    'fashion advice',
    'medical advice is outside',
    "stock advice isn't",
    "investment advice isn't",
    "don't have a strong opinion",
    'happy to help you with any study',
    'happy to help with any study',
  ];

  const clarifyPatterns = [
    'could you clarify',
    'can you clarify',
    'could you be more specific',
    'could you provide more details',
    'please provide more details',
    'could you please provide more',
    "don't have enough context",
    "don't have enough details",
    'what are you referring to',
    'what would you like',
    'what specific',
    'what kind of information',
    'what kind of help',
    'more information about what',
    'which one do you mean',
  ];

  const isClarify = clarifyPatterns.some((p) => lower.includes(p));
  if (isClarify) return 'CLARIFY';

  const isRefusal = refusalPatterns.some((p) => lower.includes(p));
  if (isRefusal) return 'REFUSE';

  return 'ANSWER';
};

const inferBehaviorFromTrace = (output: AgentOutput): ExpectedBehavior | null => {
  const { trace, gateDecision } = output;

  // Check explicit behavior from trace outcome first
  const outcomeBehavior = (trace as any)?.outcome?.behavior as ExpectedBehavior | undefined;
  if (
    outcomeBehavior === 'ANSWER' ||
    outcomeBehavior === 'CLARIFY' ||
    outcomeBehavior === 'REFUSE'
  ) {
    return outcomeBehavior;
  }

  // Check queryType from gate span
  const gateSpan = findSpan(trace, 'retrievalGate');
  const queryType = gateSpan?.meta?.queryType as string | undefined;

  // off_topic should REFUSE (check BEFORE needsClarification since gate sets both)
  if (queryType === 'off_topic') return 'REFUSE';

  // unclear/needsClarification should CLARIFY
  if (gateDecision?.needsClarification) return 'CLARIFY';
  if (gateSpan?.meta?.needsClarification) return 'CLARIFY';

  return null;
};

// -----------------------------
// Evaluators
// -----------------------------

/**
 * Behavior: TRACE FIRST, text fallback.
 * Critical must-pass.
 */
export const evaluateBehavior = (
  output: AgentOutput,
  expectedBehavior: ExpectedBehavior
): EvaluationResult => {
  const fromTrace = inferBehaviorFromTrace(output);
  const fromText = detectBehaviorFromText(output.response);

  // Trust trace first (gate classification), fall back to text detection
  const actualBehavior = fromTrace ?? fromText;

  const passed = actualBehavior === expectedBehavior;

  return {
    key: 'behavior',
    score: passed ? 1 : 0,
    weight: 3.0,
    critical: true,
    comment: passed
      ? `Correct: ${expectedBehavior}`
      : `Expected ${expectedBehavior}, got ${actualBehavior}${fromTrace ? ' (trace)' : ' (text)'}`,
  };
};

/**
 * Routing: score exact match = 1.0, acceptable fallback = 0.7, else 0.
 */
export const evaluateRouting = (
  output: AgentOutput,
  expectedCategory: Category
): EvaluationResult => {
  const gateSpan = findSpan(output.trace, 'retrievalGate');
  const actualQueryType = gateSpan?.meta?.queryType as string | undefined;

  if (!actualQueryType) {
    return {
      key: 'routing',
      score: 0,
      weight: 2.0,
      critical: false,
      comment: 'No queryType found in retrievalGate span meta',
    };
  }

  const categoryToQueryType: Record<Category, string[]> = {
    study_content: ['study_content'],
    personal: ['personal'],
    temporal_containment: ['temporal_containment', 'personal', 'study_content'],
    off_topic: ['off_topic'],
    unclear: ['unclear', 'conversational'],
    general_knowledge: ['general_knowledge'],
    conversational: ['conversational'],
  };

  const exact = categoryToQueryType[expectedCategory]?.[0] ?? expectedCategory;
  const acceptable = categoryToQueryType[expectedCategory] ?? [expectedCategory];

  let score = 0;
  let comment = `Expected ${expectedCategory}, got ${actualQueryType}`;

  if (actualQueryType === exact) {
    score = 1;
    comment = `Exact route: ${actualQueryType}`;
  } else if (acceptable.includes(actualQueryType)) {
    score = 0.7;
    comment = `Acceptable fallback route: ${actualQueryType} (expected ${expectedCategory})`;
  }

  return {
    key: 'routing',
    score,
    weight: 2.0,
    critical: false,
    comment,
  };
};

/**
 * Retrieval: if you add testCase.expected_retrieval later, we honor it.
 * Otherwise, we keep backward-compatible behavior:
 * - For ANSWER: retrieval expected (but not critical)
 * - For CLARIFY/REFUSE: retrieval not expected (small penalty if it happens)
 */
export const evaluateRetrieval = (
  output: AgentOutput,
  testCase: SmokeTestCase
): EvaluationResult => {
  const trace = output.trace;
  const retrievalSpan = findSpan(trace, 'retrieveMemoriesAndChunks');
  const injectSpan = findSpan(trace, 'injectContext');

  const chunksRetrieved = getNumberMeta(retrievalSpan, 'chunksRetrieved') ?? 0;

  // Prefer a normalized score if you log it later.
  // Otherwise, use distance only as *weak* signal.
  const topDistance = getNumberMeta(injectSpan, 'topDistance');

  const expectedRetrieval = getExpectedRetrieval(testCase);
  const behavior = testCase.expected_behavior;

  // Determine expectation
  let expectation: ExpectedRetrieval;
  if (expectedRetrieval) {
    expectation = expectedRetrieval;
  } else {
    expectation = behavior === 'ANSWER' ? 'required' : 'forbidden';
  }

  // Score
  if (expectation === 'forbidden') {
    const score = chunksRetrieved > 0 ? 0.6 : 1.0;
    return {
      key: 'retrieval',
      score,
      weight: 1.0,
      critical: false,
      comment:
        chunksRetrieved > 0
          ? `Retrieved ${chunksRetrieved} chunks when forbidden`
          : 'Correctly skipped retrieval',
    };
  }

  if (expectation === 'optional') {
    const score = chunksRetrieved > 0 ? 1.0 : 0.9;
    return {
      key: 'retrieval',
      score,
      weight: 1.0,
      critical: false,
      comment:
        chunksRetrieved > 0
          ? `Retrieved ${chunksRetrieved} chunks (optional)`
          : 'Skipped retrieval (optional)',
    };
  }

  // required
  if (chunksRetrieved === 0) {
    return {
      key: 'retrieval',
      score: 0.3,
      weight: 1.0,
      critical: false,
      comment: 'No chunks retrieved when required',
    };
  }

  // Weak quality shaping (don’t overfit to distance ranges)
  let score = 1.0;
  if (topDistance !== undefined) {
    if (topDistance > 0.85) score = 0.7;
    if (topDistance > 0.95) score = 0.5;
  }

  return {
    key: 'retrieval',
    score,
    weight: 1.0,
    critical: false,
    comment: `Retrieved ${chunksRetrieved} chunks${topDistance !== undefined ? `, topDistance=${topDistance.toFixed(3)}` : ''}`,
  };
};

/**
 * Budget/latency: uses input/output tokens if present; falls back to contextTokens.
 */
export const evaluateBudget = (output: AgentOutput, durationMs: number): EvaluationResult => {
  const trace = output.trace;

  const injectSpan = findSpan(trace, 'injectContext');
  const contextTokens = getNumberMeta(injectSpan, 'contextTokens') ?? 0;

  // If you log these, use them. Otherwise they’ll be undefined and we fall back.
  const modelSpan = findSpan(trace, 'finalAnswer') ?? findSpan(trace, 'answer'); // adjust node names
  const inputTokens = getNumberMeta(modelSpan, 'inputTokens');
  const outputTokens = getNumberMeta(modelSpan, 'outputTokens');

  // Latency thresholds
  const FAST = 3000;
  const OK = 8000;
  const SLOW = 15000;

  let latencyScore = 1.0;
  let latencyComment = 'Fast';

  if (durationMs > SLOW) {
    latencyScore = 0.3;
    latencyComment = `Very slow (${(durationMs / 1000).toFixed(1)}s)`;
  } else if (durationMs > OK) {
    latencyScore = 0.6;
    latencyComment = `Slow (${(durationMs / 1000).toFixed(1)}s)`;
  } else if (durationMs > FAST) {
    latencyScore = 0.8;
    latencyComment = `OK (${(durationMs / 1000).toFixed(1)}s)`;
  }

  // Token budgets (tune these)
  const TARGET_INPUT = 4000;
  const HARD_INPUT = 7000;

  let tokenScore = 1.0;
  let tokenComment = '';

  if (typeof inputTokens === 'number') {
    if (inputTokens > HARD_INPUT) tokenScore = 0.4;
    else if (inputTokens > TARGET_INPUT) tokenScore = 0.7;
    tokenComment = `inputTokens=${inputTokens}${typeof outputTokens === 'number' ? `, outputTokens=${outputTokens}` : ''}`;
  } else {
    // fallback: only contextTokens known
    const CONTEXT_BUDGET = 3000;
    if (contextTokens > CONTEXT_BUDGET) tokenScore = 0.7;
    tokenComment = `contextTokens=${contextTokens}`;
  }

  const score = (latencyScore + tokenScore) / 2;

  return {
    key: 'budget',
    score,
    weight: 1.0,
    critical: false,
    comment: `${latencyComment}; ${tokenComment}`,
  };
};

// -----------------------------
// Content evaluators (yours are fine)
// Add must-not-contain cheaply
// -----------------------------

export const evaluateMustNotContain = (response: string, forbidden: string[]): EvaluationResult => {
  const lower = safeLower(response);
  const found = forbidden.filter((f) => lower.includes(f.toLowerCase()));

  return {
    key: 'must_not_contain',
    score: found.length === 0 ? 1 : 0,
    weight: 2.0,
    critical: false,
    comment:
      found.length === 0 ? 'No forbidden phrases found' : `Forbidden found: ${found.join(', ')}`,
  };
};

/**
 * Check if response contains any of the required keywords (case-insensitive)
 */
export const evaluateContainsAny = (response: string, keywords: string[]): EvaluationResult => {
  const lowerResponse = safeLower(response);
  const found = keywords.filter((kw) => lowerResponse.includes(kw.toLowerCase()));

  const passed = found.length > 0;

  return {
    key: 'contains_any',
    score: passed ? 1 : 0,
    weight: 1.5,
    critical: false,
    comment: passed
      ? `Found: ${found.join(', ')}`
      : `None found. Expected any of: ${keywords.join(', ')}`,
  };
};

/**
 * Check if response contains all of the required keywords (case-insensitive)
 */
export const evaluateContainsAll = (response: string, keywords: string[]): EvaluationResult => {
  const lowerResponse = safeLower(response);
  const found = keywords.filter((kw) => lowerResponse.includes(kw.toLowerCase()));
  const missing = keywords.filter((kw) => !lowerResponse.includes(kw.toLowerCase()));

  const score = found.length / keywords.length;

  return {
    key: 'contains_all',
    score,
    weight: 1.5,
    critical: false,
    comment:
      score === 1
        ? `All keywords found: ${keywords.join(', ')}`
        : `Found ${found.length}/${keywords.length}. Missing: ${missing.join(', ')}`,
  };
};

/**
 * Check if response covers required topics (fuzzy matching)
 */
export const evaluateMustCover = (response: string, topics: string[]): EvaluationResult => {
  const lowerResponse = safeLower(response);

  // For each topic, check if the response addresses it (fuzzy matching)
  const covered = topics.filter((topic) => {
    // Split topic into key phrases and check if response contains them
    const keyPhrases = topic.toLowerCase().split(/\s+or\s+/);
    return keyPhrases.some((phrase) => {
      // Check if main words from the phrase appear in response
      const words = phrase.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = words.filter((w) => lowerResponse.includes(w)).length;
      return matchCount >= Math.ceil(words.length * 0.5);
    });
  });

  const score = covered.length / topics.length;

  return {
    key: 'must_cover',
    score,
    weight: 1.5,
    critical: false,
    comment:
      score === 1 ? `All topics covered` : `Covered ${covered.length}/${topics.length} topics`,
  };
};

/**
 * Check if response contains a specific monetary amount
 */
export const evaluateAmount = (response: string, expectedAmount: number): EvaluationResult => {
  // Extract numbers from response
  const numbers = response.match(/[$]?[\d,]+(?:\.\d{2})?/g) || [];
  const extractedAmounts = numbers.map((n) => parseFloat(n.replace(/[$,]/g, '')));

  const found = extractedAmounts.some(
    (amt) => Math.abs(amt - expectedAmount) < 1 // Allow $1 tolerance
  );

  return {
    key: 'amount',
    score: found ? 1 : 0,
    weight: 2.0,
    critical: false,
    comment: found
      ? `Found expected amount: $${expectedAmount}`
      : `Expected $${expectedAmount}, found: ${extractedAmounts.join(', ') || 'none'}`,
  };
};

// -----------------------------
// Runner updates (minimal)
// -----------------------------

export const runEvaluators = (
  output: AgentOutput,
  testCase: SmokeTestCase,
  durationMs: number
): EvaluationResult[] => {
  const results: EvaluationResult[] = [];

  // Core evaluators (always run)
  results.push(evaluateBehavior(output, testCase.expected_behavior));
  results.push(evaluateRouting(output, testCase.category));
  results.push(evaluateRetrieval(output, testCase));
  results.push(evaluateBudget(output, durationMs));

  // Content evaluators (only for ANSWER behavior)
  if (testCase.expected_behavior === 'ANSWER') {
    // Negation check - ensures affirmative answers don't just contain keywords in negative context
    if (testCase.answer_must_not_contain?.length) {
      results.push(evaluateMustNotContain(output.response, testCase.answer_must_not_contain));
    }

    if (testCase.answer_includes?.length) {
      results.push(evaluateContainsAll(output.response, testCase.answer_includes));
    }

    if (testCase.answer_must_contain_any?.length) {
      results.push(evaluateContainsAny(output.response, testCase.answer_must_contain_any));
    }

    if (testCase.answer_should_contain?.length) {
      results.push(evaluateContainsAny(output.response, testCase.answer_should_contain));
    }

    if (testCase.must_cover?.length) {
      results.push(evaluateMustCover(output.response, testCase.must_cover));
    }

    if (testCase.expected_amount_usd !== undefined) {
      results.push(evaluateAmount(output.response, testCase.expected_amount_usd));
    }
  }

  return results;
};

export const calculateOverallScore = (results: EvaluationResult[]) => {
  if (results.length === 0) {
    return { passed: true, score: 1, weightedScore: 1, summary: 'No evaluations' };
  }

  const criticalFailed = results.filter((r) => r.critical && r.score < 1);
  if (criticalFailed.length > 0) {
    return {
      passed: false,
      score: 0,
      weightedScore: 0,
      summary: `Critical failure: ${criticalFailed.map((r) => r.key).join(', ')}`,
    };
  }

  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const weightedSum = results.reduce((sum, r) => sum + r.score * r.weight, 0);
  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 1;

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passed = weightedScore >= 0.7;

  const low = results.filter((r) => r.score < 0.7);
  const summary = passed
    ? `Passed (weighted: ${weightedScore.toFixed(2)})`
    : `Failed: ${low.map((r) => `${r.key}(${r.score.toFixed(2)})`).join(', ')}`;

  return { passed, score: avgScore, weightedScore, summary };
};
