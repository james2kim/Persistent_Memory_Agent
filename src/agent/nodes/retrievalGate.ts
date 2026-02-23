import type { AgentState } from '../../schemas/types';
import { retrievalGateAssessor, retrievalGatePolicy } from '../../llm/retrievalAssessor';
import { defaultEmbedding } from '../../services/EmbeddingService';
import { TraceUtil } from '../../util/TraceUtil';

export const retrievalGate = async (state: AgentState) => {
  const query = state.userQuery;
  const span = TraceUtil.startSpan('retrievalGate');

  // Initialize trace for this query
  let trace = TraceUtil.createTrace(query);

  // Run LLM assessment and embedding generation in parallel
  const [assessment, queryEmbedding] = await Promise.all([
    retrievalGateAssessor(query),
    defaultEmbedding.embedText(query, 'query'),
  ]);

  // Policy decides what to retrieve based on assessment
  const decision = retrievalGatePolicy(assessment);

  // Clear context if skipping retrieval
  const skipRetrieval = !decision.shouldRetrieveDocuments && !decision.shouldRetrieveMemories;

  // Record span with metadata
  trace = span.end(trace, {
    queryType: assessment.queryType,
    ambiguity: assessment.ambiguity,
    riskWithoutRetrieval: assessment.riskWithoutRetrieval,
    referencesPersonalContext: assessment.referencesPersonalContext,
    referencesUploadedContent: assessment.referencesUploadedContent,
    shouldRetrieveDocuments: decision.shouldRetrieveDocuments,
    shouldRetrieveMemories: decision.shouldRetrieveMemories,
    needsClarification: decision.needsClarification,
    skipRetrieval,
  });

  return {
    gateDecision: decision,
    queryEmbedding: queryEmbedding ?? undefined,
    trace,
    ...(skipRetrieval && { retrievedContext: { documents: [], memories: [] } }),
  };
};
