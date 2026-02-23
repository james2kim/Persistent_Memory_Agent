import type { AgentState, DocumentChunk, Memory } from '../../schemas/types';
import { MemoryUtil } from '../../util/MemoryUtil';
import { DocumentUtil, type RetrievalDiagnostics } from '../../util/DocumentUtil';
import { DocumentStore } from '../../stores/DocumentStore';
import { db } from '../../db/knex';
import { getUserId } from '../../config';
import { TraceUtil } from '../../util/TraceUtil';

const documentStore = new DocumentStore(db, 1024);

export const retrieveMemoriesAndChunks = async (state: AgentState) => {
  const span = TraceUtil.startSpan('retrieveMemoriesAndChunks');
  let trace = state.trace!;

  const decision = state.gateDecision;
  const query = state.userQuery;
  const userId = getUserId();
  const queryEmbedding = state.queryEmbedding;

  if (!queryEmbedding) {
    trace = span.end(trace, {
      skipped: true,
      reason: 'no_embedding',
    });
    return {
      retrievedContext: { documents: [], memories: [] },
      trace,
    };
  }

  const retrievalTasks: Promise<void>[] = [];
  const documents: DocumentChunk[] = [];
  const memories: Memory[] = [];
  let retrievalDiagnostics: RetrievalDiagnostics | null = null;

  if (decision?.shouldRetrieveMemories) {
    retrievalTasks.push(
      MemoryUtil.retrieveRelevantMemories(userId, query, {
        maxResults: 10,
        maxTokens: 800,
        minConfidence: 0.5,
        queryEmbedding,
      }).then((result) => {
        if (result.success) {
          memories.push(...result.memories);
        }
      })
    );
  }

  if (decision?.shouldRetrieveDocuments) {
    retrievalTasks.push(
      DocumentUtil.retrieveRelevantChunks(
        documentStore,
        {
          queryEmbedding,
          user_id: userId,
          topK: 30,
          userQuery: state.userQuery,
        },
        {
          maxPerDoc: 4,
          maxChunks: 8,
        }
      )
        .then((result) => {
          documents.push(...result.chunks);
          retrievalDiagnostics = result.diagnostics;
        })
        .catch(() => {
          // Error handled silently, documents will be empty
        })
    );
  }

  await Promise.all(retrievalTasks);

  // Build trace metadata with richer diagnostics
  const traceMeta: Record<string, string | number | boolean | null> = {
    chunksRetrieved: documents.length,
    memoriesRetrieved: memories.length,
  };

  if (retrievalDiagnostics !== null) {
    const diag = retrievalDiagnostics as RetrievalDiagnostics;
    // Hybrid search stage
    traceMeta.embeddingCandidates = diag.hybridSearch.embeddingCandidates;
    traceMeta.keywordCandidates = diag.hybridSearch.keywordCandidates;
    traceMeta.fusionOverlap = diag.hybridSearch.overlapCount;
    traceMeta.fusedCount = diag.hybridSearch.fusedCount;
    // Pipeline stages
    traceMeta.afterRelevanceFilter = diag.afterRelevanceFilter;
    traceMeta.afterDedup = diag.afterDedup;
    traceMeta.afterBudget = diag.afterBudget;
    // Quality signals
    traceMeta.topChunkDistance = diag.topChunkDistance;
    traceMeta.topEmbeddingDistance = diag.hybridSearch.topEmbeddingDistance;
    traceMeta.scoreSpread = diag.scoreSpread;
    traceMeta.uniqueDocuments = diag.uniqueDocuments;
    // Temporal
    traceMeta.temporalFilterApplied = diag.temporalFilterApplied;
    traceMeta.queryYear = diag.queryYear;
  }

  // Add pruned candidate summaries (no full content, just ids + scores + snippets)
  if (documents.length > 0) {
    const candidateSummaries = TraceUtil.createCandidateSummaries(documents);
    traceMeta.topCandidates = JSON.stringify(candidateSummaries);
  }

  trace = span.end(trace, traceMeta);

  return {
    retrievedContext: {
      documents,
      memories,
    },
    trace,
  };
};
