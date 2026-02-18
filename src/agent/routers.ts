import { END } from '@langchain/langgraph';
import type { AgentState } from '../schemas/types';
import { MAX_TOOL_ATTEMPTS, MAX_MESSAGES } from './constants';

export const node1ConditionalRouter = (state: AgentState) => {
  if (state.response) {
    return 'extractAndStoreKnowledge';
  }
  if (state?.taskState?.attempts >= MAX_TOOL_ATTEMPTS) {
    return END;
  }
  if (state.tool_calls && state.tool_calls.length > 0) {
    return 'verifyAndExecuteToolIntent';
  }
  return END;
};

export const node3ConditionalRouter = (state: AgentState) => {
  console.log('NODE3 ROUTER', state.messages.length);
  if (state.messages.length >= MAX_MESSAGES) {
    return 'summarizeMessages';
  }
  return END;
};
