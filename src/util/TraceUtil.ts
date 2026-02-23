import crypto from 'crypto';
import type { AgentTrace, TraceSpan, TraceOutcome } from '../schemas/types';

export const TraceUtil = {
  /**
   * Creates a new trace for a query.
   */
  createTrace(query: string): AgentTrace {
    return {
      traceId: crypto.randomUUID(),
      queryId: crypto.randomUUID(),
      query,
      startTime: Date.now(),
      spans: [],
      outcome: null,
    };
  },

  /**
   * Creates a span and appends it to the trace.
   * Returns the updated trace (immutable).
   */
  addSpan(
    trace: AgentTrace,
    node: string,
    startTime: number,
    meta: Record<string, string | number | boolean | null> = {}
  ): AgentTrace {
    const span: TraceSpan = {
      node,
      startTime,
      durationMs: Date.now() - startTime,
      meta,
    };

    return {
      ...trace,
      spans: [...trace.spans, span],
    };
  },

  /**
   * Helper to create a span timer.
   * Usage:
   *   const span = TraceUtil.startSpan('retrievalGate');
   *   // ... do work ...
   *   trace = span.end(trace, { chunksRetrieved: 10 });
   */
  startSpan(node: string) {
    const startTime = Date.now();

    return {
      end(
        trace: AgentTrace,
        meta: Record<string, string | number | boolean | null> = {}
      ): AgentTrace {
        return TraceUtil.addSpan(trace, node, startTime, meta);
      },
    };
  },

  /**
   * Sets the final outcome on the trace.
   * Returns the updated trace (immutable).
   */
  setOutcome(
    trace: AgentTrace,
    outcome: Omit<TraceOutcome, 'durationMs'>
  ): AgentTrace {
    return {
      ...trace,
      outcome: {
        ...outcome,
        durationMs: Date.now() - trace.startTime,
      },
    };
  },

  /**
   * Extracts key metrics from a trace for logging/export.
   */
  getTraceMetrics(trace: AgentTrace) {
    const retrievalSpan = trace.spans.find((s) => s.node === 'retrieveMemoriesAndChunks');
    const gateSpan = trace.spans.find((s) => s.node === 'retrievalGate');

    return {
      traceId: trace.traceId,
      query: trace.query,
      totalDurationMs: trace.outcome?.durationMs ?? Date.now() - trace.startTime,
      spanCount: trace.spans.length,
      outcome: trace.outcome?.status ?? 'pending',
      outcomeReason: trace.outcome?.reason,

      // Retrieval metrics
      chunksRetrieved: retrievalSpan?.meta.chunksRetrieved as number | undefined,
      memoriesRetrieved: retrievalSpan?.meta.memoriesRetrieved as number | undefined,
      topChunkDistance: retrievalSpan?.meta.topChunkDistance as number | undefined,
      temporalFilterApplied: retrievalSpan?.meta.temporalFilterApplied as boolean | undefined,

      // Gate metrics
      queryType: gateSpan?.meta.queryType as string | undefined,
      shouldRetrieveDocuments: gateSpan?.meta.shouldRetrieveDocuments as boolean | undefined,
      shouldRetrieveMemories: gateSpan?.meta.shouldRetrieveMemories as boolean | undefined,
    };
  },
};
