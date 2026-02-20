import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateSchema } from '../schemas/types';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import {
  extractAndStoreKnowledge,
  retrievalGate,
  retrieveMemoriesAndChunks,
  injectContext,
  clarificationResponse,
} from './nodes';
import { retrievalGateConditionalRouter } from './routers';

export function buildWorkflow(checkpointer: RedisCheckpointer) {
  const workflow = new StateGraph(AgentStateSchema)
    .addNode('retrievalGate', retrievalGate)
    .addNode('retrieveMemoriesAndChunks', retrieveMemoriesAndChunks)
    .addNode('injectContext', injectContext)
    .addNode('clarificationResponse', clarificationResponse)
    .addNode('extractAndStoreKnowledge', extractAndStoreKnowledge)
    .addEdge(START, 'retrievalGate')
    .addConditionalEdges('retrievalGate', retrievalGateConditionalRouter)
    .addEdge('retrieveMemoriesAndChunks', 'injectContext')
    .addEdge('injectContext', 'extractAndStoreKnowledge')
    .addEdge('clarificationResponse', END)
    .addEdge('extractAndStoreKnowledge', END); // Summarization runs in background

  return workflow.compile({ checkpointer });
}
