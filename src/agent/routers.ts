import type { AgentState } from '../schemas/types';
import { MAX_MESSAGES } from './constants';

export const retrievalGateConditionalRouter = (state: AgentState) => {
  if (state.gateDecision?.needsClarification) {
    return 'clarificationResponse';
  }
  if (state.gateDecision?.shouldRetrieveDocuments || state.gateDecision?.shouldRetrieveMemories) {
    return 'retrieveMemoriesAndChunks';
  }
  return 'injectContext';
};

export const shouldRunBackgroundSummarization = (state: AgentState): boolean => {
  return state.messages.length >= MAX_MESSAGES;
};
