import type { AgentState } from '../../schemas/types';
import { retrievalGateAssessor, retrievalGatePolicy } from '../../memory/retrievalAssessor';
import { defaultEmbedding } from '../../services/EmbeddingService';

export const retrievalGate = async (state: AgentState) => {
  const query = state.userQuery;

  // Run LLM assessment and embedding generation in parallel
  // Both only need the query, neither depends on the other
  const [assessment, queryEmbedding] = await Promise.all([
    retrievalGateAssessor(query),
    defaultEmbedding.embedText(query, 'query'),
  ]);

  // Policy decides what to retrieve based on assessment
  const decision = retrievalGatePolicy(assessment);

  return {
    gateDecision: decision,
    queryEmbedding: queryEmbedding ?? undefined,
  };
};
