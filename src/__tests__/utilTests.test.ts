import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrchestrationUtil } from '../util/OrchestrationUtil';
import { TraceUtil, TRACE_LIMITS } from '../util/TraceUtil';
import type { AgentTrace } from '../schemas/types';

/**
 * Unit tests for OrchestrationUtil and TraceUtil.
 * These are fast, isolated tests with mock data.
 */

describe('OrchestrationUtil', () => {
  describe('parseStringifiedJsonFields', () => {
    it('should parse stringified JSON objects', () => {
      const input = {
        name: 'test',
        data: '{"key": "value", "num": 42}',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.name).toBe('test');
      expect(result.data).toEqual({ key: 'value', num: 42 });
    });

    it('should parse stringified JSON arrays', () => {
      const input = {
        items: '[1, 2, 3]',
        tags: '["a", "b", "c"]',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.items).toEqual([1, 2, 3]);
      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('should leave non-JSON strings unchanged', () => {
      const input = {
        text: 'hello world',
        number: 'not a json',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.text).toBe('hello world');
      expect(result.number).toBe('not a json');
    });

    it('should handle invalid JSON gracefully', () => {
      const input = {
        broken: '{invalid json}',
        alsoBroken: '[1, 2, }',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      // Should keep original strings when JSON parsing fails
      expect(result.broken).toBe('{invalid json}');
      expect(result.alsoBroken).toBe('[1, 2, }');
    });

    it('should recursively parse nested objects', () => {
      const input = {
        outer: {
          inner: '{"nested": true}',
          plain: 'text',
        },
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect((result.outer as Record<string, unknown>).inner).toEqual({ nested: true });
      expect((result.outer as Record<string, unknown>).plain).toBe('text');
    });

    it('should handle null values', () => {
      const input = {
        nullValue: null,
        data: '{"key": "value"}',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.nullValue).toBeNull();
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should preserve arrays without modification', () => {
      const input = {
        arr: [1, 2, 3],
        strArr: '["parsed"]',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.arr).toEqual([1, 2, 3]);
      expect(result.strArr).toEqual(['parsed']);
    });

    it('should handle empty object', () => {
      const result = OrchestrationUtil.parseStringifiedJsonFields({});
      expect(result).toEqual({});
    });

    it('should preserve primitive values', () => {
      const input = {
        num: 42,
        bool: true,
        str: 'plain',
      };

      const result = OrchestrationUtil.parseStringifiedJsonFields(input);

      expect(result.num).toBe(42);
      expect(result.bool).toBe(true);
      expect(result.str).toBe('plain');
    });
  });
});

describe('TraceUtil', () => {
  // Mock Date.now for consistent timing tests
  let mockNow: number;

  beforeEach(() => {
    mockNow = 1700000000000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTrace', () => {
    it('should create a trace with required fields', () => {
      const trace = TraceUtil.createTrace('What is machine learning?');

      expect(trace.query).toBe('What is machine learning?');
      expect(trace.traceId).toBeDefined();
      expect(trace.queryId).toBeDefined();
      expect(trace.startTime).toBe(mockNow);
      expect(trace.spans).toEqual([]);
      expect(trace.outcome).toBeNull();
    });

    it('should generate unique IDs', () => {
      const trace1 = TraceUtil.createTrace('query1');
      const trace2 = TraceUtil.createTrace('query2');

      expect(trace1.traceId).not.toBe(trace2.traceId);
      expect(trace1.queryId).not.toBe(trace2.queryId);
    });
  });

  describe('addSpan', () => {
    it('should add a span to the trace', () => {
      const trace = TraceUtil.createTrace('test');
      const startTime = mockNow - 100;

      const updated = TraceUtil.addSpan(trace, 'retrievalGate', startTime, {
        queryType: 'factual',
      });

      expect(updated.spans).toHaveLength(1);
      expect(updated.spans[0].node).toBe('retrievalGate');
      expect(updated.spans[0].durationMs).toBe(100);
      expect(updated.spans[0].meta.queryType).toBe('factual');
    });

    it('should not mutate the original trace', () => {
      const trace = TraceUtil.createTrace('test');
      const updated = TraceUtil.addSpan(trace, 'node1', mockNow);

      expect(trace.spans).toHaveLength(0);
      expect(updated.spans).toHaveLength(1);
    });

    it('should append multiple spans', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'node1', mockNow);
      trace = TraceUtil.addSpan(trace, 'node2', mockNow);
      trace = TraceUtil.addSpan(trace, 'node3', mockNow);

      expect(trace.spans).toHaveLength(3);
      expect(trace.spans.map((s) => s.node)).toEqual(['node1', 'node2', 'node3']);
    });
  });

  describe('startSpan', () => {
    it('should create a span timer that measures duration', () => {
      const span = TraceUtil.startSpan('testNode');
      let trace = TraceUtil.createTrace('test');

      // Advance time
      mockNow += 150;

      trace = span.end(trace, { result: 'success' });

      expect(trace.spans).toHaveLength(1);
      expect(trace.spans[0].node).toBe('testNode');
      expect(trace.spans[0].durationMs).toBe(150);
      expect(trace.spans[0].meta.result).toBe('success');
    });
  });

  describe('setOutcome', () => {
    it('should set outcome with duration', () => {
      const trace = TraceUtil.createTrace('test');

      // Advance time
      mockNow += 500;

      const updated = TraceUtil.setOutcome(trace, {
        status: 'success',
      });

      expect(updated.outcome).toBeDefined();
      expect(updated.outcome!.status).toBe('success');
      expect(updated.outcome!.durationMs).toBe(500);
    });

    it('should preserve other outcome fields', () => {
      const trace = TraceUtil.createTrace('test');

      const updated = TraceUtil.setOutcome(trace, {
        status: 'clarified',
        reason: 'ambiguous_query',
        triggeringSpan: 'retrievalGate',
      });

      expect(updated.outcome!.status).toBe('clarified');
      expect(updated.outcome!.reason).toBe('ambiguous_query');
      expect(updated.outcome!.triggeringSpan).toBe('retrievalGate');
    });
  });

  describe('getTraceMetrics', () => {
    it('should extract metrics from trace', () => {
      let trace = TraceUtil.createTrace('test query');

      trace = TraceUtil.addSpan(trace, 'retrievalGate', mockNow, {
        queryType: 'factual',
        shouldRetrieveDocuments: true,
        shouldRetrieveMemories: false,
      });

      trace = TraceUtil.addSpan(trace, 'retrieveMemoriesAndChunks', mockNow, {
        chunksRetrieved: 5,
        memoriesRetrieved: 2,
        topChunkDistance: 0.15,
        temporalFilterApplied: true,
      });

      mockNow += 300;
      trace = TraceUtil.setOutcome(trace, { status: 'success' });

      const metrics = TraceUtil.getTraceMetrics(trace);

      expect(metrics.query).toBe('test query');
      expect(metrics.spanCount).toBe(2);
      expect(metrics.outcome).toBe('success');
      expect(metrics.chunksRetrieved).toBe(5);
      expect(metrics.memoriesRetrieved).toBe(2);
      expect(metrics.topChunkDistance).toBe(0.15);
      expect(metrics.temporalFilterApplied).toBe(true);
      expect(metrics.queryType).toBe('factual');
      expect(metrics.shouldRetrieveDocuments).toBe(true);
      expect(metrics.shouldRetrieveMemories).toBe(false);
    });

    it('should handle missing spans gracefully', () => {
      const trace = TraceUtil.createTrace('test');
      const metrics = TraceUtil.getTraceMetrics(trace);

      expect(metrics.chunksRetrieved).toBeUndefined();
      expect(metrics.queryType).toBeUndefined();
      expect(metrics.outcome).toBe('pending');
    });
  });

  describe('createCandidateSummary', () => {
    it('should create summary with truncated snippet', () => {
      const longContent = 'A'.repeat(200);
      const chunk = {
        id: 'chunk-1',
        document_id: 'doc-1',
        content: longContent,
        distance: 0.25,
      };

      const summary = TraceUtil.createCandidateSummary(chunk);

      expect(summary.id).toBe('chunk-1');
      expect(summary.documentId).toBe('doc-1');
      expect(summary.score).toBe(0.25);
      expect(summary.snippet.length).toBeLessThanOrEqual(TRACE_LIMITS.MAX_SNIPPET_LENGTH + 3); // +3 for "..."
      expect(summary.snippet.endsWith('...')).toBe(true);
    });

    it('should preserve short content without truncation', () => {
      const chunk = {
        id: 'chunk-1',
        document_id: 'doc-1',
        content: 'Short content',
        distance: 0.1,
      };

      const summary = TraceUtil.createCandidateSummary(chunk);

      expect(summary.snippet).toBe('Short content');
    });

    it('should use confidence when distance is missing', () => {
      const chunk = {
        id: 'chunk-1',
        document_id: 'doc-1',
        content: 'content',
        confidence: 0.85,
      };

      const summary = TraceUtil.createCandidateSummary(chunk);

      expect(summary.score).toBe(0.85);
    });

    it('should handle missing fields with defaults', () => {
      const chunk = {};

      const summary = TraceUtil.createCandidateSummary(chunk);

      expect(summary.id).toBe('unknown');
      expect(summary.documentId).toBe('unknown');
      expect(summary.score).toBe(0);
      expect(summary.snippet).toBe('');
    });

    it('should normalize whitespace in snippet', () => {
      const chunk = {
        id: 'chunk-1',
        document_id: 'doc-1',
        content: '  Multiple   spaces\n\nand\nnewlines  ',
        distance: 0.2,
      };

      const summary = TraceUtil.createCandidateSummary(chunk);

      expect(summary.snippet).toBe('Multiple spaces and newlines');
    });
  });

  describe('createCandidateSummaries', () => {
    it('should limit to MAX_CANDIDATES_PER_RETRIEVAL', () => {
      const chunks = Array.from({ length: 20 }, (_, i) => ({
        id: `chunk-${i}`,
        document_id: `doc-${i}`,
        content: `Content ${i}`,
        distance: i * 0.05,
      }));

      const summaries = TraceUtil.createCandidateSummaries(chunks);

      expect(summaries).toHaveLength(TRACE_LIMITS.MAX_CANDIDATES_PER_RETRIEVAL);
    });

    it('should keep order (first N chunks)', () => {
      const chunks = [
        { id: 'best', distance: 0.1, content: 'best' },
        { id: 'good', distance: 0.2, content: 'good' },
        { id: 'okay', distance: 0.3, content: 'okay' },
      ];

      const summaries = TraceUtil.createCandidateSummaries(chunks);

      expect(summaries[0].id).toBe('best');
      expect(summaries[1].id).toBe('good');
      expect(summaries[2].id).toBe('okay');
    });

    it('should handle empty array', () => {
      const summaries = TraceUtil.createCandidateSummaries([]);
      expect(summaries).toEqual([]);
    });
  });

  describe('pruneTrace', () => {
    it('should truncate long queries', () => {
      const longQuery = 'A'.repeat(TRACE_LIMITS.MAX_QUERY_LENGTH + 100);
      const trace = TraceUtil.createTrace(longQuery);

      const pruned = TraceUtil.pruneTrace(trace);

      expect(pruned.query.length).toBeLessThanOrEqual(TRACE_LIMITS.MAX_QUERY_LENGTH + 3);
      expect(pruned.query.endsWith('...')).toBe(true);
    });

    it('should preserve short queries', () => {
      const trace = TraceUtil.createTrace('Short query');

      const pruned = TraceUtil.pruneTrace(trace);

      expect(pruned.query).toBe('Short query');
    });

    it('should limit spans to MAX_SPANS_PER_RUN', () => {
      let trace = TraceUtil.createTrace('test');

      // Add more spans than limit
      for (let i = 0; i < TRACE_LIMITS.MAX_SPANS_PER_RUN + 20; i++) {
        trace = TraceUtil.addSpan(trace, `node-${i}`, mockNow);
      }

      const pruned = TraceUtil.pruneTrace(trace);

      expect(pruned.spans).toHaveLength(TRACE_LIMITS.MAX_SPANS_PER_RUN);
    });

    it('should keep most recent spans when pruning', () => {
      let trace = TraceUtil.createTrace('test');

      for (let i = 0; i < TRACE_LIMITS.MAX_SPANS_PER_RUN + 5; i++) {
        trace = TraceUtil.addSpan(trace, `node-${i}`, mockNow);
      }

      const pruned = TraceUtil.pruneTrace(trace);

      // Should keep the last MAX_SPANS_PER_RUN spans
      const lastNode = pruned.spans[pruned.spans.length - 1].node;
      expect(lastNode).toBe(`node-${TRACE_LIMITS.MAX_SPANS_PER_RUN + 4}`);
    });
  });

  describe('estimateTraceSize', () => {
    it('should return JSON string length', () => {
      const trace = TraceUtil.createTrace('test');
      const size = TraceUtil.estimateTraceSize(trace);

      expect(size).toBe(JSON.stringify(trace).length);
    });

    it('should increase with more spans', () => {
      const trace1 = TraceUtil.createTrace('test');
      let trace2 = TraceUtil.createTrace('test');
      trace2 = TraceUtil.addSpan(trace2, 'node1', mockNow, { data: 'value' });

      const size1 = TraceUtil.estimateTraceSize(trace1);
      const size2 = TraceUtil.estimateTraceSize(trace2);

      expect(size2).toBeGreaterThan(size1);
    });
  });

  describe('pruneTraceMetadata', () => {
    it('should keep numeric and boolean values', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'node1', mockNow, {
        count: 42,
        enabled: true,
        ratio: 0.75,
      });

      const pruned = TraceUtil.pruneTraceMetadata(trace);

      expect(pruned.spans[0].meta.count).toBe(42);
      expect(pruned.spans[0].meta.enabled).toBe(true);
      expect(pruned.spans[0].meta.ratio).toBe(0.75);
    });

    it('should truncate long strings', () => {
      let trace = TraceUtil.createTrace('test');
      const longString = 'A'.repeat(300);
      trace = TraceUtil.addSpan(trace, 'node1', mockNow, {
        longValue: longString,
      });

      const pruned = TraceUtil.pruneTraceMetadata(trace);

      expect((pruned.spans[0].meta.longValue as string).length).toBeLessThanOrEqual(203); // 200 + "..."
      expect((pruned.spans[0].meta.longValue as string).endsWith('...')).toBe(true);
    });

    it('should preserve short strings', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'node1', mockNow, {
        shortValue: 'hello',
      });

      const pruned = TraceUtil.pruneTraceMetadata(trace);

      expect(pruned.spans[0].meta.shortValue).toBe('hello');
    });

    it('should keep null values', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'node1', mockNow, {
        nullValue: null,
      });

      const pruned = TraceUtil.pruneTraceMetadata(trace);

      expect(pruned.spans[0].meta.nullValue).toBeNull();
    });
  });

  describe('pruneSessionTraces', () => {
    it('should limit to MAX_RUNS_PER_SESSION', () => {
      const traces: AgentTrace[] = Array.from({ length: TRACE_LIMITS.MAX_RUNS_PER_SESSION + 10 }, (_, i) =>
        TraceUtil.createTrace(`query-${i}`)
      );

      const pruned = TraceUtil.pruneSessionTraces(traces);

      expect(pruned).toHaveLength(TRACE_LIMITS.MAX_RUNS_PER_SESSION);
    });

    it('should keep most recent traces', () => {
      const traces: AgentTrace[] = Array.from({ length: TRACE_LIMITS.MAX_RUNS_PER_SESSION + 5 }, (_, i) =>
        TraceUtil.createTrace(`query-${i}`)
      );

      const pruned = TraceUtil.pruneSessionTraces(traces);

      // Last trace should be the most recent
      expect(pruned[pruned.length - 1].query).toBe(`query-${TRACE_LIMITS.MAX_RUNS_PER_SESSION + 4}`);
    });

    it('should prune each trace', () => {
      const longQuery = 'A'.repeat(TRACE_LIMITS.MAX_QUERY_LENGTH + 100);
      const traces = [TraceUtil.createTrace(longQuery)];

      const pruned = TraceUtil.pruneSessionTraces(traces);

      expect(pruned[0].query.length).toBeLessThanOrEqual(TRACE_LIMITS.MAX_QUERY_LENGTH + 3);
    });

    it('should handle empty array', () => {
      const pruned = TraceUtil.pruneSessionTraces([]);
      expect(pruned).toEqual([]);
    });
  });

  describe('createTraceSummary', () => {
    it('should create summary with basic fields', () => {
      let trace = TraceUtil.createTrace('test query');
      trace = TraceUtil.setOutcome(trace, { status: 'success' });

      const summary = TraceUtil.createTraceSummary(trace);

      expect(summary.traceId).toBe(trace.traceId);
      expect(summary.outcome).toBe('success');
      expect(summary.durationMs).toBeDefined();
      expect(summary.didRetrieval).toBe(false);
    });

    it('should extract queryType from retrievalGate span', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'retrievalGate', mockNow, {
        queryType: 'study_content',
      });

      const summary = TraceUtil.createTraceSummary(trace);

      expect(summary.queryType).toBe('study_content');
    });

    it('should extract retrieval metrics from retrieveMemoriesAndChunks span', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'retrieveMemoriesAndChunks', mockNow, {
        chunksRetrieved: 5,
        memoriesRetrieved: 3,
      });

      const summary = TraceUtil.createTraceSummary(trace);

      expect(summary.didRetrieval).toBe(true);
      expect(summary.documentsRetrieved).toBe(5);
      expect(summary.memoriesRetrieved).toBe(3);
    });

    it('should handle trace without retrieval span', () => {
      let trace = TraceUtil.createTrace('test');
      trace = TraceUtil.addSpan(trace, 'retrievalGate', mockNow, {
        queryType: 'conversational',
      });

      const summary = TraceUtil.createTraceSummary(trace);

      expect(summary.didRetrieval).toBe(false);
      expect(summary.documentsRetrieved).toBe(0);
      expect(summary.memoriesRetrieved).toBe(0);
    });

    it('should handle trace without outcome', () => {
      const trace = TraceUtil.createTrace('test');
      const summary = TraceUtil.createTraceSummary(trace);

      expect(summary.outcome).toBeUndefined();
      expect(summary.durationMs).toBeUndefined();
    });
  });
});
