import type { AgentState } from '../../schemas/types';
import { rewriteQuery } from '../../llm/queryRewriter';
import { retrievalGateAssessor, retrievalGatePolicy } from '../../llm/retrievalAssessor';
import { defaultEmbedding } from '../../services/EmbeddingService';
import { TraceUtil } from '../../util/TraceUtil';

// Number of recent messages to include for query rewriting
const CONTEXT_MESSAGES_FOR_REWRITE = 4;

export const retrievalGate = async (state: AgentState) => {
  const originalQuery = state.userQuery;
  const span = TraceUtil.startSpan('retrievalGate');

  // Initialize trace for this query
  let trace = TraceUtil.createTrace(originalQuery);

  // Get recent messages for context (helps resolve "this", "that", etc.)
  // Exclude the current user message (last one) since that's the query
  const recentMessages = state.messages.slice(-CONTEXT_MESSAGES_FOR_REWRITE - 1, -1);
  const conversationContext = recentMessages
    .map((m) => {
      const role = m.constructor.name === 'HumanMessage' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      // Truncate long messages to save tokens
      const truncated = content.length > 300 ? content.slice(0, 300) + '...' : content;
      return `${role}: ${truncated}`;
    })
    .join('\n');

  // Step 1: Rewrite query to resolve references
  const { rewrittenQuery, wasRewritten } = await rewriteQuery(originalQuery, conversationContext);

  // Use rewritten query for assessment and embedding
  const queryForProcessing = rewrittenQuery;

  // Step 2: Run assessment and embedding in parallel
  const [assessment, queryEmbedding] = await Promise.all([
    retrievalGateAssessor(queryForProcessing),
    defaultEmbedding.embedText(queryForProcessing, 'query'),
  ]);

  // Step 3: Policy decides what to retrieve based on assessment
  const decision = retrievalGatePolicy(assessment);

  // Clear context if skipping retrieval
  const skipRetrieval = !decision.shouldRetrieveDocuments && !decision.shouldRetrieveMemories;

  // Record span with metadata
  trace = span.end(trace, {
    originalQuery,
    rewrittenQuery: wasRewritten ? rewrittenQuery : null,
    wasRewritten,
    queryType: assessment.queryType,
    referencesPersonalContext: assessment.referencesPersonalContext,
    shouldRetrieveDocuments: decision.shouldRetrieveDocuments,
    shouldRetrieveMemories: decision.shouldRetrieveMemories,
    needsClarification: decision.needsClarification,
    skipRetrieval,
  });

  return {
    gateDecision: decision,
    queryEmbedding: queryEmbedding ?? undefined,
    // Store rewritten query for use in response generation
    userQuery: queryForProcessing,
    trace,
    ...(skipRetrieval && { retrievedContext: { documents: [], memories: [] } }),
  };
};
