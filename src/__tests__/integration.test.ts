import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildWorkflow } from '../agent/graph';
import { RedisSessionStore } from '../stores/RedisSessionStore';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import type { AgentTrace } from '../schemas/types';
import crypto from 'crypto';

/**
 * Integration Tests for Agent Workflow
 *
 * These tests run the full agent pipeline and assert on trace outcomes.
 * They verify end-to-end behavior rather than unit testing individual components.
 */

let agentApp: ReturnType<typeof buildWorkflow>;
let sessionId: string;

async function runAgent(query: string): Promise<{ response?: string; trace?: AgentTrace }> {
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

describe('Agent Integration Tests', () => {
  beforeAll(async () => {
    await RedisSessionStore.connect();
    const checkpointer = new RedisCheckpointer(RedisSessionStore);

    // Create a fresh session for tests
    sessionId = `test-session-${crypto.randomUUID()}`;
    agentApp = buildWorkflow(checkpointer);
  });

  afterAll(async () => {
    // Clean up test session
    try {
      await RedisSessionStore.getClient().del(`session:${sessionId}`);
      await RedisSessionStore.getClient().del(`checkpoint:${sessionId}:latest`);
    } catch {
      // Ignore cleanup errors
    }
    await RedisSessionStore.disconnect();
  });

  describe('Trace Outcomes', () => {
    it('should produce success outcome for valid study query', async () => {
      const { trace } = await runAgent('What are the key concepts in my biology notes?');

      expect(trace).toBeDefined();
      expect(trace?.outcome?.status).toBe('success');
      expect(trace?.spans.length).toBeGreaterThan(0);
    });

    it('should produce clarified outcome for ambiguous query', async () => {
      const { trace, response } = await runAgent('Tell me about it');

      expect(trace).toBeDefined();
      // Ambiguous queries should either clarify or still succeed
      expect(['success', 'clarified']).toContain(trace?.outcome?.status);

      if (trace?.outcome?.status === 'clarified') {
        expect(response).toMatch(/clarif|specific|more detail/i);
      }
    });

    it('should handle conversational queries without retrieval', async () => {
      const { trace } = await runAgent('Hello, how are you?');

      expect(trace).toBeDefined();

      const gateSpan = trace?.spans.find((s) => s.node === 'retrievalGate');
      expect(gateSpan).toBeDefined();
      expect(gateSpan?.meta.queryType).toBe('conversational');
    });
  });

  describe('Retrieval Pipeline', () => {
    it('should retrieve documents for study content queries', async () => {
      const { trace } = await runAgent('What does my resume say about my work experience?');

      expect(trace).toBeDefined();

      const gateSpan = trace?.spans.find((s) => s.node === 'retrievalGate');
      expect(gateSpan?.meta.shouldRetrieveDocuments).toBe(true);

      const retrievalSpan = trace?.spans.find((s) => s.node === 'retrieveMemoriesAndChunks');
      if (retrievalSpan) {
        // Verify diagnostics are captured
        expect(retrievalSpan.meta).toHaveProperty('embeddingCandidates');
        expect(retrievalSpan.meta).toHaveProperty('afterBudget');
      }
    });

    it('should retrieve memories for personal queries', async () => {
      const { trace } = await runAgent('What are my study goals?');

      expect(trace).toBeDefined();

      const gateSpan = trace?.spans.find((s) => s.node === 'retrievalGate');
      expect(gateSpan?.meta.shouldRetrieveMemories).toBe(true);
    });

    it('should apply temporal filtering when query contains year', async () => {
      const { trace } = await runAgent('What did I work on in 2023?');

      expect(trace).toBeDefined();

      const retrievalSpan = trace?.spans.find((s) => s.node === 'retrieveMemoriesAndChunks');
      if (retrievalSpan) {
        expect(retrievalSpan.meta.temporalFilterApplied).toBe(true);
        expect(retrievalSpan.meta.queryYear).toBe(2023);
      }
    });
  });

  describe('Performance Bounds', () => {
    it('should complete within reasonable time', async () => {
      const { trace } = await runAgent('Summarize my uploaded documents');

      expect(trace).toBeDefined();
      expect(trace?.outcome?.durationMs).toBeLessThan(30000); // 30 seconds max
    });

    it('should have reasonable span durations', async () => {
      const { trace } = await runAgent('What is in my notes?');

      expect(trace).toBeDefined();

      for (const span of trace?.spans ?? []) {
        // No single span should take more than 15 seconds
        expect(span.durationMs).toBeLessThan(15000);
      }
    });
  });

  describe('Error Resilience', () => {
    it('should handle minimal queries gracefully', async () => {
      const { trace, response } = await runAgent('hi');

      // Should still produce a trace and response
      expect(trace).toBeDefined();
      expect(response).toBeDefined();
    });

    it('should handle moderately long queries', async () => {
      const longQuery = 'Please help me understand this concept: '.repeat(10);
      const { trace } = await runAgent(longQuery);

      expect(trace).toBeDefined();
      expect(trace?.outcome).toBeDefined();
    });
  });
});
