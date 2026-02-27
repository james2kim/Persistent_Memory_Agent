/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LangSmith Experiment Runner
 *
 * This script runs smoke tests against the agent and logs results to LangSmith.
 *
 * Usage:
 *   npx tsx src/evals/runExperiment.ts
 *   npx tsx src/evals/runExperiment.ts --split base
 *   npx tsx src/evals/runExperiment.ts --category off_topic
 *
 * Prerequisites:
 *   Run `npx tsx src/evals/seed.ts` first to seed test data.
 */

// Load env BEFORE any other imports (must be synchronous)
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Set eval user ID for consistent test data retrieval
import { EVAL_USER_ID } from './fixtures/evalDocuments';
process.env.EVAL_USER_ID = EVAL_USER_ID;

// Use separate LangSmith project for eval traces
process.env.LANGCHAIN_PROJECT = 'study-agent-evals';

// Now import non-agent modules
import { Client } from 'langsmith';
import { evaluate, type EvaluationResult as LSEvaluationResult } from 'langsmith/evaluation';
import {
  SMOKE_TEST_DATASET,
  getTestCasesBySplit,
  getTestCasesByCategory,
  type SmokeTestCase,
  type Category,
} from './dataset';
import { runEvaluators, calculateOverallScore, type AgentOutput } from './evaluators';
import * as crypto from 'crypto';

// Dynamic imports for modules that depend on env vars
const loadAgentModules = async () => {
  const { buildWorkflow } = await import('../agent/graph');
  const { RedisSessionStore } = await import('../stores/RedisSessionStore');
  const { RedisCheckpointer } = await import('../memory/RedisCheckpointer');
  return { buildWorkflow, RedisSessionStore, RedisCheckpointer };
};

// LangSmith dataset name
const DATASET_NAME = 'smoke-tests-v1';

// Initialize LangSmith client
const client = new Client();

/**
 * Create or update the LangSmith dataset with test cases
 */
async function ensureDataset(testCases: SmokeTestCase[]): Promise<string> {
  // Check if dataset exists
  let dataset;
  try {
    dataset = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`Found existing dataset: ${DATASET_NAME}`);
  } catch {
    // Create new dataset
    dataset = await client.createDataset(DATASET_NAME, {
      description: 'Smoke tests for the Study Assistant Agent',
    });
    console.log(`Created new dataset: ${DATASET_NAME}`);
  }

  // Get existing examples
  const existingExamples: Array<{ inputs: { userQuery: string } }> = [];
  for await (const example of client.listExamples({ datasetId: dataset.id })) {
    const ex = example as unknown as { inputs: { userQuery: string } };
    existingExamples.push(ex);
  }
  const existingQueries = new Set(existingExamples.map((e) => e.inputs.userQuery));

  // Add missing examples
  const newExamples = testCases.filter((tc) => !existingQueries.has(tc.userQuery));

  if (newExamples.length > 0) {
    console.log(`Adding ${newExamples.length} new examples to dataset...`);

    for (const tc of newExamples) {
      await client.createExample(
        { userQuery: tc.userQuery },
        {
          category: tc.category,
          expected_behavior: tc.expected_behavior,
          answer_includes: tc.answer_includes,
          answer_must_contain_any: tc.answer_must_contain_any,
          answer_should_contain: tc.answer_should_contain,
          must_cover: tc.must_cover,
          expected_amount_usd: tc.expected_amount_usd,
        },
        { datasetId: dataset.id }
      );
    }
  }

  return dataset.id;
}

interface AgentRunResult {
  output: AgentOutput;
  durationMs: number;
}

/**
 * Target function that runs the agent
 */
async function runAgent(
  inputs: { userQuery: string },
  agentApp: any,
  redisStore: any
): Promise<AgentRunResult> {
  const sessionId = `eval-${crypto.randomUUID()}`;
  const startTime = Date.now();

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: inputs.userQuery,
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await agentApp.invoke(
      {
        messages: [userMessage],
        userQuery: inputs.userQuery,
      },
      { configurable: { thread_id: sessionId } }
    );

    // Clean up session
    try {
      await redisStore.getClient().del(`session:${sessionId}`);
      await redisStore.getClient().del(`checkpoint:${sessionId}:latest`);
    } catch {
      // Ignore cleanup errors
    }

    return {
      output: {
        response: result?.response || '',
        trace: result?.trace,
        gateDecision: result?.gateDecision,
      },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`Error running agent for query: ${inputs.userQuery}`, error);
    return {
      output: { response: `ERROR: ${error}` },
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Custom evaluator for LangSmith
 */
function createEvaluator(testCases: SmokeTestCase[]) {
  const testCaseMap = new Map(testCases.map((tc) => [tc.userQuery, tc]));

  // Use LangSmith's expected signature with Run type
  return async (run: {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
  }): Promise<LSEvaluationResult[]> => {
    const inputs = run.inputs as { userQuery?: string } | undefined;
    const outputs = run.outputs as { output?: AgentOutput; durationMs?: number } | undefined;

    const userQuery = inputs?.userQuery;
    if (!userQuery) {
      return [
        {
          key: 'missing_input',
          score: 0,
          comment: 'No userQuery in inputs',
        },
      ];
    }

    const testCase = testCaseMap.get(userQuery);
    if (!testCase) {
      return [
        {
          key: 'unknown_test_case',
          score: 0,
          comment: 'Test case not found in dataset',
        },
      ];
    }

    const output = outputs?.output || { response: '' };
    const durationMs = outputs?.durationMs || 0;

    const evalResults = runEvaluators(output, testCase, durationMs);
    const overall = calculateOverallScore(evalResults);

    // Convert to LangSmith format
    const lsResults: LSEvaluationResult[] = evalResults.map((r) => ({
      key: r.key,
      score: r.score,
      comment: r.comment,
    }));

    // Add overall result
    lsResults.push({
      key: 'overall',
      score: overall.score,
      comment: overall.summary,
    });

    return lsResults;
  };
}

/**
 * Run the experiment
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let testCases = SMOKE_TEST_DATASET;
  let experimentName = 'smoke-test';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--split' && args[i + 1]) {
      const split = args[i + 1];
      testCases = getTestCasesBySplit(split);
      experimentName = `smoke-test-${split}`;
      i++;
    } else if (args[i] === '--category' && args[i + 1]) {
      const category = args[i + 1] as Category;
      testCases = getTestCasesByCategory(category);
      experimentName = `smoke-test-${category}`;
      i++;
    }
  }

  if (testCases.length === 0) {
    console.error('No test cases found for the specified filter');
    process.exit(1);
  }

  console.log(`Running ${testCases.length} test cases...`);
  console.log(`Experiment name: ${experimentName}`);

  // Load agent modules (after env is loaded)
  const { buildWorkflow, RedisSessionStore, RedisCheckpointer } = await loadAgentModules();

  // Connect to Redis
  await RedisSessionStore.connect();
  const checkpointer = new RedisCheckpointer(RedisSessionStore);
  const agentApp = buildWorkflow(checkpointer);

  try {
    // Ensure dataset exists
    await ensureDataset(testCases);

    // Create target function bound to agent
    const target = (inputs: { userQuery: string }) => runAgent(inputs, agentApp, RedisSessionStore);

    // Run evaluation
    const results = await evaluate(target, {
      data: DATASET_NAME,
      evaluators: [createEvaluator(testCases)],
      experimentPrefix: experimentName,
      maxConcurrency: 2, // Limit concurrency to avoid rate limits
    });

    console.log('\n=== Experiment Complete ===');
    console.log(`View results at: https://smith.langchain.com`);

    // Print summary
    let passed = 0;
    let failed = 0;

    for await (const result of results) {
      const evalResults = result.evaluationResults?.results as
        | Array<{ key: string; score: number }>
        | undefined;
      const overallResult = evalResults?.find((r) => r.key === 'overall');
      if (overallResult && overallResult.score >= 0.7) {
        passed++;
      } else {
        failed++;
        const runInputs = result.run?.inputs as { userQuery?: string } | undefined;
        const runOutputs = result.run?.outputs as { output?: { response?: string } } | undefined;
        console.log(`FAILED: ${runInputs?.userQuery}`);
        console.log(`  Response: ${runOutputs?.output?.response?.slice(0, 100)}...`);
        console.log(`  Results: ${JSON.stringify(evalResults)}`);
      }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
  } finally {
    await RedisSessionStore.disconnect();
  }
}

main().catch(console.error);
