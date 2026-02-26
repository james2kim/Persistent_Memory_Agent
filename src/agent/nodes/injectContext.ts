import type { AgentState } from '../../schemas/types';
import { sonnetModel, haikuModel, CONTEXT_WINDOW_MESSAGES } from '../constants';
import { SYSTEM_MESSAGE, buildContextBlock } from '../../llm/promptBuilder';
import { TraceUtil } from '../../util/TraceUtil';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

// Route to Haiku if retrieval is relevant
const MIN_CHUNKS_FOR_HAIKU = 2;
const MAX_DISTANCE_FOR_HAIKU = 0.6;

export const injectContext = async (state: AgentState) => {
  const span = TraceUtil.startSpan('injectContext');
  let trace = state.trace!;

  const documents = state.retrievedContext?.documents ?? [];
  const memories = state.retrievedContext?.memories ?? [];

  // Route decision:
  // - No context needed (conversational) → Haiku (fast)
  // - Good retrieval (low distance) → Haiku (synthesis)
  // - Weak retrieval → Sonnet (better at "I don't know")
  const topDistance = documents[0]?.distance ?? 1;

  const hasGoodRetrieval =
    documents.length >= MIN_CHUNKS_FOR_HAIKU && topDistance <= MAX_DISTANCE_FOR_HAIKU;
  const noContextNeeded = documents.length === 0 && memories.length === 0;

  const useHaiku = hasGoodRetrieval || noContextNeeded;
  const model = useHaiku ? haikuModel : sonnetModel;
  const modelName = useHaiku ? 'haiku' : 'sonnet';

  console.log(
    `[injectContext] Using ${modelName} (dist=${topDistance.toFixed(3)}, chunks=${documents.length})`
  );

  const contextBlock = buildContextBlock(documents, memories);
  const contextTokens = contextBlock ? Math.ceil(contextBlock.length / 4) : 0;

  const userQuery = state.userQuery;

  const userContent = contextBlock ? `${userQuery}\n\n${contextBlock}` : userQuery;

  // Get previous messages (exclude the current user message which is last)
  const allPreviousMessages = state.messages.slice(0, -1);

  // Use summary + last N messages instead of full history
  // This reduces token usage while preserving context
  const recentMessages = allPreviousMessages.slice(-CONTEXT_WINDOW_MESSAGES);

  // Build system message with summary if available
  // Include summary in system message so the whole prefix can be cached together
  let systemContent = SYSTEM_MESSAGE;
  if (state.summary && state.summary.length > 0) {
    systemContent = `${SYSTEM_MESSAGE}\n\n## Conversation Summary (older context)\n${state.summary}`;
  }

  // Create system message with cache_control for prompt caching
  // This caches the system prompt + summary, reducing latency on subsequent requests
  const systemMessage = new SystemMessage({
    content: systemContent,
    additional_kwargs: {
      cache_control: { type: 'ephemeral' },
    },
  });

  const messagesForLLM = [systemMessage, ...recentMessages, new HumanMessage(userContent)];

  const aiMessage = await model.invoke(messagesForLLM);

  const response =
    typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content);

  trace = span.end(trace, {
    model: modelName,
    topDistance,
    documentsUsed: documents.length,
    memoriesUsed: memories.length,
    contextTokens,
    hasContext: contextBlock !== null,
    responseLength: response.length,
    totalMessages: allPreviousMessages.length,
    messagesInContext: recentMessages.length,
    hasSummary: state.summary && state.summary.length > 0,
  });

  return {
    messages: [aiMessage],
    response,
    trace,
  };
};
