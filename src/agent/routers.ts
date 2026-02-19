import { END } from '@langchain/langgraph';
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

export const extractAndStoreKnowledgeConditionalRouter = (state: AgentState) => {
  console.log('NODE3 ROUTER', state.messages.length);
  if (state.messages.length >= MAX_MESSAGES) {
    return 'summarizeMessages';
  }
  return END;
};
