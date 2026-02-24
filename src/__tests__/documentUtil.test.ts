import { describe, it, expect } from 'vitest';
import { DocumentUtil } from '../util/DocumentUtil';
import { TitleExtractor } from '../util/TitleExtractor';
import type { DocumentChunk } from '../schemas/types';

/**
 * Unit tests for DocumentUtil functions.
 * These are fast, isolated tests with mock data - no database or API calls.
 */

// Helper to create mock chunks
function createMockChunk(overrides: Partial<DocumentChunk> = {}): DocumentChunk {
  return {
    id: overrides.id ?? 'chunk-1',
    document_id: overrides.document_id ?? 'doc-1',
    chunk_index: overrides.chunk_index ?? 0,
    content: overrides.content ?? 'Test content for the chunk.',
    token_count: overrides.token_count ?? 10,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? new Date().toISOString(),
    embedding: overrides.embedding ?? [],
    distance: overrides.distance ?? 0.2,
    confidence: overrides.confidence ?? 0.8,
    document_title: overrides.document_title,
    document_source: overrides.document_source,
  };
}

function createMockChunks(count: number, baseProps: Partial<DocumentChunk> = {}): DocumentChunk[] {
  return Array.from({ length: count }, (_, i) =>
    createMockChunk({
      id: `chunk-${i}`,
      chunk_index: i,
      distance: 0.1 + i * 0.05, // Increasing distance (decreasing relevance)
      ...baseProps,
    })
  );
}

describe('DocumentUtil.applyBudget', () => {
  describe('maxChunks constraint', () => {
    it('should limit to maxChunks when exceeded', () => {
      // Use different document_ids to avoid maxPerDoc constraint
      const chunks = createMockChunks(10).map((c, i) => ({
        ...c,
        document_id: `doc-${i}`, // Each chunk from different doc
      }));
      const result = DocumentUtil.applyBudget(chunks, { maxChunks: 5, maxPerDoc: 10 });

      expect(result).toHaveLength(5);
    });

    it('should keep all chunks when under maxChunks', () => {
      const chunks = createMockChunks(3).map((c, i) => ({
        ...c,
        document_id: `doc-${i}`,
      }));
      const result = DocumentUtil.applyBudget(chunks, { maxChunks: 10, maxPerDoc: 10 });

      expect(result).toHaveLength(3);
    });

    it('should preserve order (most relevant first)', () => {
      const chunks = createMockChunks(5).map((c, i) => ({
        ...c,
        document_id: `doc-${i}`,
      }));
      const result = DocumentUtil.applyBudget(chunks, { maxChunks: 3, maxPerDoc: 10 });

      expect(result[0].id).toBe('chunk-0');
      expect(result[1].id).toBe('chunk-1');
      expect(result[2].id).toBe('chunk-2');
    });
  });

  describe('maxPerDoc constraint', () => {
    it('should limit chunks per document', () => {
      const chunks = [
        createMockChunk({ id: 'c1', document_id: 'doc-A', chunk_index: 0 }),
        createMockChunk({ id: 'c2', document_id: 'doc-A', chunk_index: 1 }),
        createMockChunk({ id: 'c3', document_id: 'doc-A', chunk_index: 2 }),
        createMockChunk({ id: 'c4', document_id: 'doc-A', chunk_index: 3 }),
        createMockChunk({ id: 'c5', document_id: 'doc-B', chunk_index: 0 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxPerDoc: 2, maxChunks: 10 });

      const docACounts = result.filter((c) => c.document_id === 'doc-A').length;
      const docBCounts = result.filter((c) => c.document_id === 'doc-B').length;

      expect(docACounts).toBe(2);
      expect(docBCounts).toBe(1);
      expect(result).toHaveLength(3);
    });

    it('should keep first N chunks per doc (by relevance order)', () => {
      const chunks = [
        createMockChunk({ id: 'c1', document_id: 'doc-A', distance: 0.1 }),
        createMockChunk({ id: 'c2', document_id: 'doc-A', distance: 0.2 }),
        createMockChunk({ id: 'c3', document_id: 'doc-A', distance: 0.3 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxPerDoc: 2 });

      expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
    });
  });

  describe('maxContextTokens constraint', () => {
    it('should stop adding chunks when token budget exceeded', () => {
      const chunks = [
        createMockChunk({ id: 'c1', token_count: 100 }),
        createMockChunk({ id: 'c2', token_count: 100 }),
        createMockChunk({ id: 'c3', token_count: 100 }),
        createMockChunk({ id: 'c4', token_count: 100 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxContextTokens: 250, maxChunks: 10 });

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('should skip chunks that would exceed budget but continue to next', () => {
      const chunks = [
        createMockChunk({ id: 'c1', token_count: 100 }),
        createMockChunk({ id: 'c2', token_count: 200 }), // Would exceed 250, skipped
        createMockChunk({ id: 'c3', token_count: 50 }), // Fits in remaining 150
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxContextTokens: 250, maxChunks: 10 });

      // c1 (100) + c3 (50) = 150, under budget
      expect(result.map((c) => c.id)).toEqual(['c1', 'c3']);
    });
  });

  describe('maxChunkTokens constraint', () => {
    it('should filter out chunks exceeding maxChunkTokens', () => {
      const chunks = [
        createMockChunk({ id: 'c1', token_count: 100 }),
        createMockChunk({ id: 'c2', token_count: 800 }), // Exceeds 700 default
        createMockChunk({ id: 'c3', token_count: 200 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxChunkTokens: 700 });

      expect(result.map((c) => c.id)).toEqual(['c1', 'c3']);
    });

    it('should keep first chunk even if it exceeds maxChunkTokens (soft filter)', () => {
      const chunks = [
        createMockChunk({ id: 'c1', token_count: 1000 }), // Exceeds but kept (first)
        createMockChunk({ id: 'c2', token_count: 100 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxChunkTokens: 700 });

      expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
    });
  });

  describe('combined constraints', () => {
    it('should apply all constraints in order', () => {
      const chunks = [
        // Doc A: 4 chunks
        createMockChunk({ id: 'a1', document_id: 'doc-A', token_count: 100, distance: 0.1 }),
        createMockChunk({ id: 'a2', document_id: 'doc-A', token_count: 100, distance: 0.15 }),
        createMockChunk({ id: 'a3', document_id: 'doc-A', token_count: 100, distance: 0.2 }),
        createMockChunk({ id: 'a4', document_id: 'doc-A', token_count: 100, distance: 0.25 }),
        // Doc B: 2 chunks
        createMockChunk({ id: 'b1', document_id: 'doc-B', token_count: 100, distance: 0.12 }),
        createMockChunk({ id: 'b2', document_id: 'doc-B', token_count: 100, distance: 0.18 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, {
        maxPerDoc: 2,
        maxChunks: 3,
        maxContextTokens: 500,
      });

      // maxPerDoc=2: keeps a1, a2, b1, b2 (a3, a4 dropped)
      // maxChunks=3: keeps first 3
      // maxContextTokens=500: 3 * 100 = 300, all fit
      expect(result).toHaveLength(3);
    });

    it('should handle empty input', () => {
      const result = DocumentUtil.applyBudget([], { maxChunks: 5 });
      expect(result).toEqual([]);
    });
  });

  describe('token count fallback', () => {
    it('should estimate tokens from content length when token_count is missing', () => {
      const content = 'A'.repeat(400); // ~100 tokens at 4 chars/token
      const chunks = [
        createMockChunk({ id: 'c1', content, token_count: 0 }), // Missing token_count
        createMockChunk({ id: 'c2', content, token_count: 0 }),
        createMockChunk({ id: 'c3', content, token_count: 0 }),
      ];

      const result = DocumentUtil.applyBudget(chunks, { maxContextTokens: 250, maxChunks: 10 });

      // Each chunk ~100 tokens, budget 250 = 2 chunks
      expect(result).toHaveLength(2);
    });
  });
});

describe('DocumentUtil.estimateTokens', () => {
  it('should estimate ~4 chars per token', () => {
    expect(DocumentUtil.estimateTokens('test')).toBe(1); // 4 chars
    expect(DocumentUtil.estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(DocumentUtil.estimateTokens('a]')).toBe(1); // 2 chars / 4 = 0.5 → 1
  });

  it('should handle empty string', () => {
    expect(DocumentUtil.estimateTokens('')).toBe(0);
  });

  it('should round up fractional tokens', () => {
    expect(DocumentUtil.estimateTokens('a')).toBe(1); // 1 char → ceil(0.25) = 1
    expect(DocumentUtil.estimateTokens('ab')).toBe(1); // 2 chars → ceil(0.5) = 1
    expect(DocumentUtil.estimateTokens('abc')).toBe(1); // 3 chars → ceil(0.75) = 1
    expect(DocumentUtil.estimateTokens('abcd')).toBe(1); // 4 chars → ceil(1) = 1
    expect(DocumentUtil.estimateTokens('abcde')).toBe(2); // 5 chars → ceil(1.25) = 2
  });

  it('should handle longer text', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'; // 44 chars
    expect(DocumentUtil.estimateTokens(text)).toBe(11); // 44 / 4 = 11
  });

  it('should handle text with whitespace and special chars', () => {
    const text = '  Hello,   World!  \n\t'; // 21 chars including whitespace
    expect(DocumentUtil.estimateTokens(text)).toBe(6); // ceil(21/4) = 6
  });
});

describe('DocumentUtil.cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('should handle similar but not identical vectors', () => {
    const a = [1, 0, 0];
    const b = [0.9, 0.1, 0]; // Slightly different
    const similarity = DocumentUtil.cosineSimilarity(a, b);

    expect(similarity).toBeGreaterThan(0.9);
    expect(similarity).toBeLessThan(1);
  });

  it('should return 0 for zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(DocumentUtil.cosineSimilarity(a, b)).toBe(0);
  });

  it('should handle normalized vectors', () => {
    // Unit vectors
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const c = [0, 0, 1];

    expect(DocumentUtil.cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    expect(DocumentUtil.cosineSimilarity(b, c)).toBeCloseTo(0, 5);
  });

  it('should be symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];

    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(
      DocumentUtil.cosineSimilarity(b, a),
      10
    );
  });

  it('should handle high-dimensional vectors', () => {
    // Simulate embedding vectors (1024 dimensions)
    const dim = 1024;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.sin(i + 0.1)); // Slightly shifted

    const similarity = DocumentUtil.cosineSimilarity(a, b);
    expect(similarity).toBeGreaterThan(0.99); // Should be very similar
  });

  it('should handle vectors with negative values', () => {
    const a = [-1, -2, -3];
    const b = [-1, -2, -3];
    expect(DocumentUtil.cosineSimilarity(a, b)).toBeCloseTo(1, 5);

    const c = [1, 2, 3];
    expect(DocumentUtil.cosineSimilarity(a, c)).toBeCloseTo(-1, 5);
  });
});

describe('DocumentUtil.removeDuplicateChunks', () => {
  it('should remove chunks with high cosine similarity', () => {
    const embedding = [1, 0, 0];
    const similarEmbedding = [0.99, 0.01, 0]; // Very similar

    const chunks = [
      { ...createMockChunk({ id: 'c1' }), embedding },
      { ...createMockChunk({ id: 'c2' }), embedding: similarEmbedding },
      { ...createMockChunk({ id: 'c3' }), embedding: [0, 1, 0] }, // Different
    ];

    const result = DocumentUtil.removeDuplicateChunks(chunks, 0.9);

    // c2 should be removed as duplicate of c1
    expect(result.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('should keep chunks without embeddings', () => {
    const chunks = [
      { ...createMockChunk({ id: 'c1' }), embedding: [] },
      { ...createMockChunk({ id: 'c2' }), embedding: [] },
    ];

    const result = DocumentUtil.removeDuplicateChunks(chunks, 0.9);

    expect(result).toHaveLength(2);
  });
});

describe('TitleExtractor', () => {
  describe('isTruncated', () => {
    it('should detect titles ending with prepositions', () => {
      expect(TitleExtractor.isTruncated('Long-Term Effectiveness of Dutasteride versus')).toBe(true);
      expect(TitleExtractor.isTruncated('A Study of')).toBe(true);
      expect(TitleExtractor.isTruncated('Comparison with')).toBe(true);
      expect(TitleExtractor.isTruncated('Analysis in')).toBe(true);
    });

    it('should detect titles ending with conjunctions', () => {
      expect(TitleExtractor.isTruncated('Machine Learning and')).toBe(true);
      expect(TitleExtractor.isTruncated('Pros or')).toBe(true);
    });

    it('should detect titles ending with articles', () => {
      expect(TitleExtractor.isTruncated('Understanding the')).toBe(true);
      expect(TitleExtractor.isTruncated('Introduction to a')).toBe(true);
    });

    it('should accept complete titles', () => {
      expect(TitleExtractor.isTruncated('Understanding Neural Networks')).toBe(false);
      expect(TitleExtractor.isTruncated('Machine Learning Fundamentals')).toBe(false);
      expect(TitleExtractor.isTruncated('A Complete Study')).toBe(false);
    });

    it('should handle single-word titles', () => {
      expect(TitleExtractor.isTruncated('Introduction')).toBe(false);
      expect(TitleExtractor.isTruncated('of')).toBe(true); // Single preposition
    });

    it('should be case-insensitive', () => {
      expect(TitleExtractor.isTruncated('Something AND')).toBe(true);
      expect(TitleExtractor.isTruncated('Something VERSUS')).toBe(true);
    });
  });

  describe('extractMarkdownHeading', () => {
    it('should extract # heading', () => {
      const content = '# Introduction to Machine Learning\n\nThis is the content.';
      expect(TitleExtractor.extractMarkdownHeading(content)).toBe('Introduction to Machine Learning');
    });

    it('should extract ## heading', () => {
      const content = '## Chapter 1: Getting Started\n\nContent here.';
      expect(TitleExtractor.extractMarkdownHeading(content)).toBe('Chapter 1: Getting Started');
    });

    it('should return null for content without headings', () => {
      const content = 'Just some regular text without any headings.';
      expect(TitleExtractor.extractMarkdownHeading(content)).toBeNull();
    });

    it('should reject headings that are too long', () => {
      const longHeading = '# ' + 'A'.repeat(160);
      expect(TitleExtractor.extractMarkdownHeading(longHeading)).toBeNull();
    });
  });

  describe('extractFirstLineTitle', () => {
    it('should extract short first line as title', () => {
      const content = 'The Art of Programming\n\nThis book explores...';
      expect(TitleExtractor.extractFirstLineTitle(content)).toBe('The Art of Programming');
    });

    it('should reject long first lines', () => {
      const content = 'A'.repeat(120) + '\n\nMore content.';
      expect(TitleExtractor.extractFirstLineTitle(content)).toBeNull();
    });

    it('should reject sentence-like first lines', () => {
      const content = 'This is a full sentence. It has multiple parts. And continues on.\n\nMore.';
      expect(TitleExtractor.extractFirstLineTitle(content)).toBeNull();
    });

    it('should reject JSON/code-like content', () => {
      const content = '{"title": "something"}\n\nMore content.';
      expect(TitleExtractor.extractFirstLineTitle(content)).toBeNull();
    });
  });

  describe('cleanFilename', () => {
    it('should remove extension', () => {
      expect(TitleExtractor.cleanFilename('document.pdf')).toBe('document');
    });

    it('should replace dashes and underscores with spaces', () => {
      expect(TitleExtractor.cleanFilename('my-cool_document.txt')).toBe('my cool document');
    });

    it('should handle multiple extensions', () => {
      expect(TitleExtractor.cleanFilename('file.backup.pdf')).toBe('file.backup');
    });
  });

  describe('extractTitle', () => {
    it('should prefer markdown heading over first line', () => {
      const content = 'Some intro text\n\n# The Real Title\n\nContent.';
      expect(TitleExtractor.extractTitle(content, 'fallback.pdf')).toBe('The Real Title');
    });

    it('should use first line when no markdown heading', () => {
      const content = 'Biology 101 Study Guide\n\nChapter 1 covers...';
      expect(TitleExtractor.extractTitle(content, 'notes.pdf')).toBe('Biology 101 Study Guide');
    });

    it('should fallback to cleaned filename', () => {
      const content = 'This is a very long first line that goes on and on and probably should not be used as a title because it is way too long.\n\nMore content.';
      expect(TitleExtractor.extractTitle(content, 'my-research-paper.pdf')).toBe('my research paper');
    });

    it('should handle real-world markdown document', () => {
      const content = `# Understanding Neural Networks

## Introduction

Neural networks are a class of machine learning models...`;
      expect(TitleExtractor.extractTitle(content, 'nn.md')).toBe('Understanding Neural Networks');
    });

    it('should handle real-world PDF-like content', () => {
      const content = `Research on Climate Change Impact

Abstract

This paper presents findings on...`;
      expect(TitleExtractor.extractTitle(content, 'paper.pdf')).toBe('Research on Climate Change Impact');
    });
  });
});
