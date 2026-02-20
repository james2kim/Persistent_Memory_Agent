import type { AgentState } from '../../schemas/types';
import { sonnetModel } from '../constants';
import { SYSTEM_MESSAGE, buildContextBlock } from '../../llm/promptBuilder';

export const injectContext = async (state: AgentState) => {
  const documents = state.retrievedContext?.documents ?? [];
  const memories = state.retrievedContext?.memories ?? [];

  console.log(`[injectContext] Documents: ${documents.length}, Memories: ${memories.length}`);

  const contextBlock = buildContextBlock(documents, memories);
  console.log(
    `[injectContext] Context block: ${contextBlock ? contextBlock.length + ' chars' : 'null'}`
  );

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

  return {
    messages: [aiMessage],
    response,
  };
};
