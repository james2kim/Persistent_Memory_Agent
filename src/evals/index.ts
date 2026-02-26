/**
 * Evaluation Module
 *
 * This module provides smoke testing and evaluation infrastructure
 * for the Study Assistant Agent.
 *
 * Components:
 * - dataset.ts: Test case definitions and dataset utilities
 * - evaluators.ts: Custom evaluators for checking agent responses
 * - runLocal.ts: Local test runner (no LangSmith required)
 * - runExperiment.ts: LangSmith experiment runner
 *
 * Usage:
 *   # Run local smoke tests
 *   npm run eval
 *
 *   # Run with verbose output
 *   npm run eval:verbose
 *
 *   # Run specific category
 *   npx tsx src/evals/runLocal.ts --category off_topic
 *
 *   # Run LangSmith experiment
 *   npm run eval:langsmith
 */

export * from './dataset';
export * from './evaluators';
