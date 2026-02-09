import { RemoveMessage } from '@langchain/core/messages';
import type { AgentState } from '../../schemas/types';
import { summarize } from '../../memory/summarizeMessages';
import { MAX_MESSAGES } from '../constants';

const findSafeCutIndex = (messages: AgentState['messages'], targetCount: number): number => {
  let cutIndex = Math.min(targetCount, messages.length);

  while (cutIndex < messages.length && messages[cutIndex].constructor.name === 'ToolMessage') {
    cutIndex++;
  }

  return cutIndex;
};

export const summarizeMessages = async (state: AgentState) => {
  const safeCutIndex = findSafeCutIndex(state.messages, MAX_MESSAGES / 2);
  const messagesToSummarize = state.messages.slice(0, safeCutIndex);
  const summarization = await summarize(state.summary, messagesToSummarize);
  console.log('NODE4', summarization);

  const removeMessages = messagesToSummarize.map(
    (msg) => new RemoveMessage({ id: msg.id as string })
  );

  return {
    messages: removeMessages,
    summary: summarization.content,
  };
};
