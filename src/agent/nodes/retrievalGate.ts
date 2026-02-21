import type { AgentState } from '../../schemas/types';
import { retrievalGateAssessor, retrievalGatePolicy } from '../../llm/retrievalAssessor';

import { defaultEmbedding } from '../../services/EmbeddingService';

export const retrievalGate = async (state: AgentState) => {
  const query = state.userQuery;
  console.log(`[retrievalGate] Query: "${query}"`);

  // Run LLM assessment and embedding generation in parallel
  // Both only need the query, neither depends on the other
  const [assessment, queryEmbedding] = await Promise.all([
    retrievalGateAssessor(query),
    defaultEmbedding.embedText(query, 'query'),
  ]);

  console.log(`[retrievalGate] Assessment:`, JSON.stringify(assessment, null, 2));

  // Policy decides what to retrieve based on assessment
  const decision = retrievalGatePolicy(assessment);
  console.log(
    `[retrievalGate] Decision: docs=${decision.shouldRetrieveDocuments}, mems=${decision.shouldRetrieveMemories}, clarify=${decision.needsClarification}`
  );

  // Clear context if skipping retrieval (prevents stale context from previous queries)
  const skipRetrieval = !decision.shouldRetrieveDocuments && !decision.shouldRetrieveMemories;

  return {
    gateDecision: decision,
    queryEmbedding: queryEmbedding ?? undefined,
    ...(skipRetrieval && { retrievedContext: { documents: [], memories: [] } }),
  };
};
