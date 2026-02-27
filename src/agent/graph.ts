import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateSchema } from '../schemas/types';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import {
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
    .addEdge(START, 'retrievalGate')
    .addConditionalEdges('retrievalGate', retrievalGateConditionalRouter)
    .addEdge('retrieveMemoriesAndChunks', 'injectContext')
    .addEdge('injectContext', END) // Knowledge extraction runs in background
    .addEdge('clarificationResponse', END);

  return workflow.compile({ checkpointer });
}
