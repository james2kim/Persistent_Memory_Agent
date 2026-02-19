import type { AgentState } from '../../schemas/types';
import { buildSystemMessage, model } from '../constants';
export const injectContext = async (state: AgentState) => {
  const documents = state.retrievedContext?.documents ?? [];
  const memories = state.retrievedContext?.memories ?? [];

  const systemMessage = buildSystemMessage(documents, memories);

  // Invoke the LLM with the built system message and conversation history
  const aiMessage = await model.invoke([
    { role: 'system', content: systemMessage },
    ...state.messages,
  ]);

  const response =
    typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content);

  return {
    messages: [aiMessage],
    response,
  };
};
