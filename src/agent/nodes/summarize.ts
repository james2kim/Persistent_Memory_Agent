import { RemoveMessage } from '@langchain/core/messages';
import type { AgentState } from '../../schemas/types';
import { summarize } from '../../llm/summarizeMessages';
import { MESSAGES_TO_SUMMARIZE } from '../constants';

const findSafeCutIndex = (messages: AgentState['messages'], targetCount: number): number => {
  let cutIndex = Math.min(targetCount, messages.length);

  while (cutIndex < messages.length && messages[cutIndex].constructor.name === 'ToolMessage') {
    cutIndex++;
  }

  return cutIndex;
};

export const summarizeMessages = async (state: AgentState) => {
  const safeCutIndex = findSafeCutIndex(state.messages, MESSAGES_TO_SUMMARIZE);
  const messagesToSummarize = state.messages.slice(0, safeCutIndex);
  const summarization = await summarize(state.summary, messagesToSummarize);

  const removeMessages = messagesToSummarize.map(
    (msg) => new RemoveMessage({ id: msg.id as string })
  );

  return {
    messages: removeMessages,
    summary: summarization.content,
  };
};
