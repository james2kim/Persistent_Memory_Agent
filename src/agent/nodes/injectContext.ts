import type { AgentState } from '../../schemas/types';
import { sonnetModel } from '../constants';
import { SYSTEM_MESSAGE, buildContextBlock } from '../../llm/promptBuilder';
import { TraceUtil } from '../../util/TraceUtil';

export const injectContext = async (state: AgentState) => {
  const span = TraceUtil.startSpan('injectContext');
  let trace = state.trace!;

  const documents = state.retrievedContext?.documents ?? [];
  const memories = state.retrievedContext?.memories ?? [];

  const contextBlock = buildContextBlock(documents, memories);
  const contextTokens = contextBlock ? Math.ceil(contextBlock.length / 4) : 0;

  const userQuery = state.userQuery;

  const userContent = contextBlock
    ? [
        `TASK\nAnswer the USER REQUEST using CONTEXT. Cite sources for factual claims.`,
        `\nUSER REQUEST\n${userQuery}`,
        `\nCONTEXT\n<<<CONTEXT_START>>>\n${contextBlock}\n<<<CONTEXT_END>>>`,
        `\nFOCUS\n${userQuery}`,
      ].join('\n')
    : userQuery;

  const previousMessages = state.messages.slice(0, -1);

  const aiMessage = await sonnetModel.invoke([
    { role: 'system', content: SYSTEM_MESSAGE },
    ...previousMessages,
    { role: 'user', content: userContent },
  ]);

  const response =
    typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content);

  trace = span.end(trace, {
    documentsUsed: documents.length,
    memoriesUsed: memories.length,
    contextTokens,
    hasContext: contextBlock !== null,
    responseLength: response.length,
  });

  return {
    messages: [aiMessage],
    response,
    trace,
  };
};
