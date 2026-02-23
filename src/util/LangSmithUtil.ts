import type { AgentTrace } from '../schemas/types';
import { TraceUtil } from './TraceUtil';

/**
 * Utilities for integrating internal AgentTrace with LangSmith.
 *
 * LangSmith Setup:
 *   1. Set environment variables:
 *      LANGCHAIN_TRACING_V2=true
 *      LANGCHAIN_API_KEY=ls__...
 *      LANGCHAIN_PROJECT=study-agent
 *
 *   2. LangGraph automatically traces all runs to LangSmith
 *
 *   3. Use these utilities to attach our domain-specific trace metadata
 */

export const LangSmithUtil = {
  /**
   * Converts AgentTrace to LangSmith-compatible metadata.
   * Attach this to run metadata for custom filtering/dashboards.
   */
  traceToMetadata(trace: AgentTrace): Record<string, unknown> {
    const metrics = TraceUtil.getTraceMetrics(trace);

    return {
      // Core identifiers
      'agent.traceId': trace.traceId,
      'agent.queryId': trace.queryId,

      // Outcome
      'agent.outcome': metrics.outcome,
      'agent.outcomeReason': metrics.outcomeReason,
      'agent.totalDurationMs': metrics.totalDurationMs,

      // Gate decisions
      'agent.queryType': metrics.queryType,
      'agent.shouldRetrieveDocuments': metrics.shouldRetrieveDocuments,
      'agent.shouldRetrieveMemories': metrics.shouldRetrieveMemories,

      // Retrieval quality
      'agent.chunksRetrieved': metrics.chunksRetrieved,
      'agent.memoriesRetrieved': metrics.memoriesRetrieved,
      'agent.topChunkDistance': metrics.topChunkDistance,
      'agent.temporalFilterApplied': metrics.temporalFilterApplied,

      // Pipeline diagnostics (from retrieval span)
      ...this.extractRetrievalDiagnostics(trace),
    };
  },

  /**
   * Extracts retrieval pipeline diagnostics from trace for LangSmith.
   */
  extractRetrievalDiagnostics(trace: AgentTrace): Record<string, unknown> {
    const span = trace.spans.find((s) => s.node === 'retrieveMemoriesAndChunks');
    if (!span) return {};

    return {
      'retrieval.embeddingCandidates': span.meta.embeddingCandidates,
      'retrieval.keywordCandidates': span.meta.keywordCandidates,
      'retrieval.fusionOverlap': span.meta.fusionOverlap,
      'retrieval.fusedCount': span.meta.fusedCount,
      'retrieval.afterRelevanceFilter': span.meta.afterRelevanceFilter,
      'retrieval.afterDedup': span.meta.afterDedup,
      'retrieval.afterBudget': span.meta.afterBudget,
      'retrieval.topChunkDistance': span.meta.topChunkDistance,
      'retrieval.scoreSpread': span.meta.scoreSpread,
      'retrieval.uniqueDocuments': span.meta.uniqueDocuments,
    };
  },

  /**
   * Creates a summary line for logging.
   */
  traceSummaryLine(trace: AgentTrace): string {
    const metrics = TraceUtil.getTraceMetrics(trace);
    const parts = [
      `[${metrics.outcome}]`,
      `${metrics.totalDurationMs}ms`,
      `type=${metrics.queryType}`,
      `chunks=${metrics.chunksRetrieved ?? 0}`,
      `memories=${metrics.memoriesRetrieved ?? 0}`,
    ];

    if (metrics.topChunkDistance !== undefined) {
      parts.push(`dist=${metrics.topChunkDistance.toFixed(3)}`);
    }

    return parts.join(' | ');
  },

  /**
   * Checks if a trace indicates potential quality issues.
   * Useful for alerting or flagging runs for review.
   */
  detectQualityIssues(trace: AgentTrace): string[] {
    const issues: string[] = [];
    const metrics = TraceUtil.getTraceMetrics(trace);

    // No chunks retrieved for a document query
    if (metrics.shouldRetrieveDocuments && (metrics.chunksRetrieved ?? 0) === 0) {
      issues.push('no_chunks_retrieved');
    }

    // High distance on top chunk (weak match)
    if (metrics.topChunkDistance !== undefined && metrics.topChunkDistance > 0.5) {
      issues.push('weak_top_match');
    }

    // Very slow execution
    if (metrics.totalDurationMs > 20000) {
      issues.push('slow_execution');
    }

    // Error outcome
    if (metrics.outcome === 'error') {
      issues.push('error_outcome');
    }

    return issues;
  },
};
