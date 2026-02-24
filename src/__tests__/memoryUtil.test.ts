import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryUtil } from '../util/MemoryUtil';
import type { Memory } from '../schemas/types';

/**
 * Unit tests for MemoryUtil functions.
 * These are fast, isolated tests with mock data - no database or API calls.
 */

// Helper to create mock memories
function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: overrides.user_id ?? 'test-user',
    type: overrides.type ?? 'fact',
    confidence: overrides.confidence ?? 0.8,
    content: overrides.content ?? 'Test memory content for testing purposes.',
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

describe('MemoryUtil', () => {
  describe('shouldSummarize', () => {
    it('should return true when messages exceed threshold', () => {
      const messages = Array(50).fill({ role: 'user', content: 'test' });
      expect(MemoryUtil.shouldSummarize(messages, 40)).toBe(true);
    });

    it('should return true when messages equal threshold', () => {
      const messages = Array(40).fill({ role: 'user', content: 'test' });
      expect(MemoryUtil.shouldSummarize(messages, 40)).toBe(true);
    });

    it('should return false when messages below threshold', () => {
      const messages = Array(30).fill({ role: 'user', content: 'test' });
      expect(MemoryUtil.shouldSummarize(messages, 40)).toBe(false);
    });

    it('should use default threshold of 40', () => {
      const messages39 = Array(39).fill({ role: 'user', content: 'test' });
      const messages40 = Array(40).fill({ role: 'user', content: 'test' });

      expect(MemoryUtil.shouldSummarize(messages39)).toBe(false);
      expect(MemoryUtil.shouldSummarize(messages40)).toBe(true);
    });

    it('should handle empty array', () => {
      expect(MemoryUtil.shouldSummarize([])).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate ~4 chars per token', () => {
      expect(MemoryUtil.estimateTokens('test')).toBe(1); // 4 chars
      expect(MemoryUtil.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
    });

    it('should handle empty string', () => {
      expect(MemoryUtil.estimateTokens('')).toBe(0);
    });

    it('should round up fractional tokens', () => {
      expect(MemoryUtil.estimateTokens('a')).toBe(1); // 1 char → ceil(0.25) = 1
      expect(MemoryUtil.estimateTokens('abcde')).toBe(2); // 5 chars → ceil(1.25) = 2
    });
  });

  describe('chunkText', () => {
    it('should return single chunk for short text', () => {
      const text = 'Short text that fits in one chunk.';
      const chunks = MemoryUtil.chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(text);
      expect(chunks[0].chunk_index).toBe(0);
    });

    it('should split long text into multiple chunks', () => {
      // Create text that exceeds default 1000 tokens (~4000 chars)
      const paragraph = 'This is a paragraph of text. '.repeat(50);
      const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;

      const chunks = MemoryUtil.chunkText(text);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should have sequential indices
      chunks.forEach((chunk, i) => {
        expect(chunk.chunk_index).toBe(i);
      });
    });

    it('should respect maxTokensPerChunk option', () => {
      const text = 'Word '.repeat(100); // ~500 chars = ~125 tokens

      const chunks = MemoryUtil.chunkText(text, { maxTokensPerChunk: 50 });

      chunks.forEach((chunk) => {
        const tokens = MemoryUtil.estimateTokens(chunk.content);
        // Allow some flexibility due to paragraph/sentence boundaries
        expect(tokens).toBeLessThanOrEqual(60);
      });
    });

    it('should respect maxChunks option', () => {
      const text = 'Paragraph of text. '.repeat(200);

      const chunks = MemoryUtil.chunkText(text, { maxChunks: 3 });

      expect(chunks.length).toBeLessThanOrEqual(3);
    });

    it('should handle text with only whitespace', () => {
      const chunks = MemoryUtil.chunkText('   \n\n   ');
      expect(chunks).toHaveLength(0);
    });

    it('should trim whitespace from chunks', () => {
      const text = '  First paragraph.  \n\n  Second paragraph.  ';
      const chunks = MemoryUtil.chunkText(text);

      chunks.forEach((chunk) => {
        expect(chunk.content).toBe(chunk.content.trim());
      });
    });

    it('should calculate token count for each chunk', () => {
      const text = 'Test content for chunking.';
      const chunks = MemoryUtil.chunkText(text);

      expect(chunks[0].token_count).toBe(MemoryUtil.estimateTokens(chunks[0].content));
    });

    it('should handle very long sentences by splitting on characters', () => {
      // Single sentence longer than maxTokensPerChunk
      const longSentence = 'A'.repeat(500); // ~125 tokens

      const chunks = MemoryUtil.chunkText(longSentence, { maxTokensPerChunk: 50 });

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('applyBudget', () => {
    it('should limit to maxMemories', () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        createMockMemory({ id: `mem-${i}`, content: 'Short content.' })
      );

      const result = MemoryUtil.applyBudget(memories, { maxMemories: 3 });

      expect(result).toHaveLength(3);
    });

    it('should limit by maxTokens', () => {
      const memories = [
        createMockMemory({ id: 'mem-1', content: 'A'.repeat(400) }), // ~100 tokens
        createMockMemory({ id: 'mem-2', content: 'B'.repeat(400) }), // ~100 tokens
        createMockMemory({ id: 'mem-3', content: 'C'.repeat(400) }), // ~100 tokens
      ];

      const result = MemoryUtil.applyBudget(memories, { maxTokens: 250 });

      expect(result).toHaveLength(2);
    });

    it('should use default limits when options not provided', () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        createMockMemory({ id: `mem-${i}`, content: 'Short.' })
      );

      const result = MemoryUtil.applyBudget(memories);

      // Default maxMemories is 5
      expect(result).toHaveLength(5);
    });

    it('should preserve order (first memories first)', () => {
      const memories = [
        createMockMemory({ id: 'first' }),
        createMockMemory({ id: 'second' }),
        createMockMemory({ id: 'third' }),
      ];

      const result = MemoryUtil.applyBudget(memories, { maxMemories: 2 });

      expect(result[0].id).toBe('first');
      expect(result[1].id).toBe('second');
    });

    it('should handle empty array', () => {
      const result = MemoryUtil.applyBudget([]);
      expect(result).toEqual([]);
    });

    it('should stop at token budget even if maxMemories not reached', () => {
      const memories = [
        createMockMemory({ id: 'mem-1', content: 'A'.repeat(600) }), // ~150 tokens
        createMockMemory({ id: 'mem-2', content: 'B'.repeat(600) }), // ~150 tokens
      ];

      // 300 tokens total but maxTokens is 200
      const result = MemoryUtil.applyBudget(memories, { maxMemories: 10, maxTokens: 200 });

      expect(result).toHaveLength(1);
    });
  });

  describe('passRelevanceRules', () => {
    let mockNow: number;

    beforeEach(() => {
      mockNow = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should reject low confidence memories (< 0.6)', () => {
      const memory = createMockMemory({ confidence: 0.5 });
      expect(MemoryUtil.passRelevanceRules(memory)).toBe(false);
    });

    it('should accept high confidence memories', () => {
      const memory = createMockMemory({ confidence: 0.8 });
      expect(MemoryUtil.passRelevanceRules(memory)).toBe(true);
    });

    it('should accept memories at confidence threshold (0.6)', () => {
      const memory = createMockMemory({ confidence: 0.6 });
      expect(MemoryUtil.passRelevanceRules(memory)).toBe(true);
    });

    it('should reject memories with invalid created_at', () => {
      const memory = createMockMemory({ created_at: 'invalid-date' });
      expect(MemoryUtil.passRelevanceRules(memory)).toBe(false);
    });

    it('should reject memories with empty content', () => {
      const memory = createMockMemory({ content: '   ' });
      expect(MemoryUtil.passRelevanceRules(memory)).toBe(false);
    });

    describe('type-based expiration', () => {
      it('should not expire preference memories', () => {
        const memory = createMockMemory({
          type: 'preference',
          confidence: 0.8,
          created_at: new Date(mockNow - 365 * 86400000).toISOString(), // 365 days ago
        });
        expect(MemoryUtil.passRelevanceRules(memory)).toBe(true);
      });

      it('should not expire fact memories', () => {
        const memory = createMockMemory({
          type: 'fact',
          confidence: 0.8,
          created_at: new Date(mockNow - 365 * 86400000).toISOString(), // 365 days ago
        });
        expect(MemoryUtil.passRelevanceRules(memory)).toBe(true);
      });

      it('should expire summary memories after 90 days', () => {
        const fresh = createMockMemory({
          type: 'summary',
          confidence: 0.8,
          created_at: new Date(mockNow - 30 * 86400000).toISOString(), // 30 days ago
        });
        expect(MemoryUtil.passRelevanceRules(fresh)).toBe(true);

        const expired = createMockMemory({
          type: 'summary',
          confidence: 0.8,
          created_at: new Date(mockNow - 100 * 86400000).toISOString(), // 100 days ago
        });
        expect(MemoryUtil.passRelevanceRules(expired)).toBe(false);
      });

      it('should expire goal memories after 90 days', () => {
        const fresh = createMockMemory({
          type: 'goal',
          confidence: 0.8,
          created_at: new Date(mockNow - 60 * 86400000).toISOString(), // 60 days ago
        });
        expect(MemoryUtil.passRelevanceRules(fresh)).toBe(true);

        const expired = createMockMemory({
          type: 'goal',
          confidence: 0.8,
          created_at: new Date(mockNow - 95 * 86400000).toISOString(), // 95 days ago
        });
        expect(MemoryUtil.passRelevanceRules(expired)).toBe(false);
      });

      it('should expire decision memories after 30 days', () => {
        const fresh = createMockMemory({
          type: 'decision',
          confidence: 0.8,
          created_at: new Date(mockNow - 15 * 86400000).toISOString(), // 15 days ago
        });
        expect(MemoryUtil.passRelevanceRules(fresh)).toBe(true);

        const expired = createMockMemory({
          type: 'decision',
          confidence: 0.8,
          created_at: new Date(mockNow - 35 * 86400000).toISOString(), // 35 days ago
        });
        expect(MemoryUtil.passRelevanceRules(expired)).toBe(false);
      });
    });
  });

  describe('relevanceScore', () => {
    it('should add 3 points for matching task type', () => {
      const memory = createMockMemory({ type: 'fact', confidence: 0 });

      const withMatch = MemoryUtil.relevanceScore(memory, ['fact', 'preference']);
      const withoutMatch = MemoryUtil.relevanceScore(memory, ['goal']);

      expect(withMatch).toBeGreaterThan(withoutMatch);
      expect(withMatch - withoutMatch).toBe(3);
    });

    it('should add 2 points for fact type', () => {
      const fact = createMockMemory({ type: 'fact', confidence: 0 });
      const goal = createMockMemory({ type: 'goal', confidence: 0 });

      expect(MemoryUtil.relevanceScore(fact)).toBeGreaterThan(MemoryUtil.relevanceScore(goal));
    });

    it('should add 2 points for preference type', () => {
      const preference = createMockMemory({ type: 'preference', confidence: 0 });
      const summary = createMockMemory({ type: 'summary', confidence: 0 });

      expect(MemoryUtil.relevanceScore(preference)).toBeGreaterThan(
        MemoryUtil.relevanceScore(summary)
      );
    });

    it('should scale with confidence (confidence * 2)', () => {
      const highConf = createMockMemory({ type: 'goal', confidence: 1.0 });
      const lowConf = createMockMemory({ type: 'goal', confidence: 0.5 });

      const diff = MemoryUtil.relevanceScore(highConf) - MemoryUtil.relevanceScore(lowConf);
      expect(diff).toBeCloseTo(1.0); // (1.0 - 0.5) * 2 = 1.0
    });

    it('should add keyword boost when query matches content', () => {
      const memory = createMockMemory({ content: 'User prefers visual learning' });

      const withMatch = MemoryUtil.relevanceScore(memory, undefined, 'visual learning');
      const withoutMatch = MemoryUtil.relevanceScore(memory, undefined, 'something else');

      expect(withMatch).toBeGreaterThan(withoutMatch);
    });

    it('should only check first 12 chars of query for keyword boost', () => {
      const memory = createMockMemory({ content: 'User prefers visual aids' });

      // "User prefers" is 12 chars - should match
      const score = MemoryUtil.relevanceScore(memory, undefined, 'User prefers visual aids');
      const baseScore = MemoryUtil.relevanceScore(memory);

      expect(score).toBeGreaterThan(baseScore);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 2, 3];
      expect(MemoryUtil.cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(MemoryUtil.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(MemoryUtil.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(MemoryUtil.cosineSimilarity(a, b)).toBe(0);
    });

    it('should be symmetric', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      expect(MemoryUtil.cosineSimilarity(a, b)).toBeCloseTo(
        MemoryUtil.cosineSimilarity(b, a),
        10
      );
    });

    it('should handle high-dimensional vectors', () => {
      const dim = 1024;
      const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
      const b = Array.from({ length: dim }, (_, i) => Math.sin(i + 0.1));

      const similarity = MemoryUtil.cosineSimilarity(a, b);
      expect(similarity).toBeGreaterThan(0.99);
    });
  });
});
