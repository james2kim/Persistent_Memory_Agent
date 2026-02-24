import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildWorkflow } from '../agent/graph';
import { RedisSessionStore } from '../stores/RedisSessionStore';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import type { AgentTrace } from '../schemas/types';
import crypto from 'crypto';

/**
 * Smoke Tests - Minimal end-to-end tests to verify agent flow is wired correctly.
 *
 * These are NOT quality evaluations (that's for LangSmith).
 * These verify: "Does the pipeline execute without breaking?"
 *
 * Happy path: Valid study query → retrieval → response → success outcome
 * Sad path: Ambiguous/off-topic query → clarification → clarified outcome
 */

let agentApp: ReturnType<typeof buildWorkflow>;
let sessionId: string;

async function runAgent(query: string): Promise<{
  response?: string;
  trace?: AgentTrace;
}> {
  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: query,
    createdAt: new Date().toISOString(),
  };

  const result = await agentApp.invoke(
    {
      messages: [userMessage],
      userQuery: query,
    },
    { configurable: { thread_id: sessionId } }
  );

  return {
    response: result?.response,
    trace: result?.trace,
  };
}

describe('Smoke Tests', () => {
  beforeAll(async () => {
    await RedisSessionStore.connect();
    const checkpointer = new RedisCheckpointer(RedisSessionStore);
    sessionId = `smoke-test-${crypto.randomUUID()}`;
    agentApp = buildWorkflow(checkpointer);
  });

  afterAll(async () => {
    try {
      await RedisSessionStore.getClient().del(`session:${sessionId}`);
      await RedisSessionStore.getClient().del(`checkpoint:${sessionId}:latest`);
    } catch {
      // Ignore cleanup errors
    }
    await RedisSessionStore.disconnect();
  });

  describe('Happy Path', () => {
    it('should complete successfully for a valid study query', async () => {
      const { response, trace } = await runAgent(
        'What information do you have about my study materials?'
      );

      // Pipeline completed
      expect(response).toBeDefined();
      expect(response!.length).toBeGreaterThan(0);

      // Trace structure is correct
      expect(trace).toBeDefined();
      expect(trace!.traceId).toBeDefined();
      expect(trace!.outcome).toBeDefined();
      expect(trace!.outcome!.status).toBe('success');

      // Expected spans exist
      const spanNodes = trace!.spans.map((s) => s.node);
      expect(spanNodes).toContain('retrievalGate');
      expect(spanNodes).toContain('retrieveMemoriesAndChunks');
      expect(spanNodes).toContain('injectContext');
      expect(spanNodes).toContain('extractAndStoreKnowledge');
    });
  });

  describe('Alternate Path', () => {
    it('should skip retrieval for conversational queries', async () => {
      const { response, trace } = await runAgent('Hello, how are you?');

      // Pipeline completed (didn't crash)
      expect(response).toBeDefined();
      expect(response!.length).toBeGreaterThan(0);

      // Still succeeds, but skipped retrieval
      expect(trace).toBeDefined();
      expect(trace!.outcome).toBeDefined();
      expect(trace!.outcome!.status).toBe('success');

      // Gate decided to skip retrieval
      const gateSpan = trace!.spans.find((s) => s.node === 'retrievalGate');
      expect(gateSpan).toBeDefined();
      expect(gateSpan!.meta.queryType).toBe('conversational');
      expect(gateSpan!.meta.shouldRetrieveDocuments).toBe(false);
      expect(gateSpan!.meta.shouldRetrieveMemories).toBe(false);

      // Retrieval node was skipped (no chunks to retrieve)
      const retrievalSpan = trace!.spans.find((s) => s.node === 'retrieveMemoriesAndChunks');
      if (retrievalSpan) {
        // If it ran, it should have retrieved nothing
        expect(retrievalSpan.meta.chunksRetrieved).toBe(0);
        expect(retrievalSpan.meta.memoriesRetrieved).toBe(0);
      }
    });
  });
});
