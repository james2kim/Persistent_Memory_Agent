import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateSchema } from '../schemas/types';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import {
  extractAndStoreKnowledge,
  summarizeMessages,
  retrievalGate,
  retrieveMemoriesAndChunks,
  injectContext,
  clarificationResponse,
} from './nodes';
import {
  retrievalGateConditionalRouter,
  extractAndStoreKnowledgeConditionalRouter,
} from './routers';

export function buildWorkflow(checkpointer: RedisCheckpointer) {
  const workflow = new StateGraph(AgentStateSchema)
    .addNode('retrievalGate', retrievalGate)
    .addNode('retrieveMemoriesAndChunks', retrieveMemoriesAndChunks)
    .addNode('injectContext', injectContext)
    .addNode('clarificationResponse', clarificationResponse)
    .addNode('extractAndStoreKnowledge', extractAndStoreKnowledge)
    .addNode('summarizeMessages', summarizeMessages)
    .addEdge(START, 'retrievalGate')
    .addConditionalEdges('retrievalGate', retrievalGateConditionalRouter)
    .addEdge('retrieveMemoriesAndChunks', 'injectContext')
    .addEdge('injectContext', 'extractAndStoreKnowledge')
    .addEdge('clarificationResponse', END)
    .addConditionalEdges('extractAndStoreKnowledge', extractAndStoreKnowledgeConditionalRouter)
    .addEdge('summarizeMessages', END);

  return workflow.compile({ checkpointer });
}
