import type { AgentState } from '../../schemas/types';
import { TOOLS_BY_NAME } from '../../tools/tools';
import { model, SYSTEM_MESSAGE } from '../constants';

export const classifyLLMToolIntent = async (state: AgentState) => {
  const modelWithTools = model.bindTools(Object.values(TOOLS_BY_NAME));
  const aiMessage = await modelWithTools.invoke([
    { role: 'system', content: SYSTEM_MESSAGE },
    ...state.messages,
  ]);
  const toolCalls = aiMessage.tool_calls ?? [];

  if (toolCalls.length > 0) {
    return {
      messages: [aiMessage],
      tool_calls: toolCalls,
      response: undefined,
    };
  }

  return {
    messages: [aiMessage],
    response:
      typeof aiMessage.content === 'string' ? aiMessage.content : JSON.stringify(aiMessage.content),
    tool_calls: undefined,
  };
};
