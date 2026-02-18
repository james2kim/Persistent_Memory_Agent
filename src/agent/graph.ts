import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateSchema } from '../schemas/types';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import {
  classifyLLMToolIntent,
  verifyAndExecuteToolIntent,
  extractAndStoreKnowledge,
  summarizeMessages,
} from './nodes';
import { node1ConditionalRouter, node3ConditionalRouter } from './routers';

export function buildWorkflow(checkpointer: RedisCheckpointer) {
  const workflow = new StateGraph(AgentStateSchema)
    .addNode('classifyLlmToolIntent', classifyLLMToolIntent)
    .addNode('verifyAndExecuteToolIntent', verifyAndExecuteToolIntent)
    .addNode('extractAndStoreKnowledge', extractAndStoreKnowledge)
    .addNode('summarizeMessages', summarizeMessages)
    .addEdge(START, 'classifyLlmToolIntent')
    .addConditionalEdges('classifyLlmToolIntent', node1ConditionalRouter)
    .addEdge('verifyAndExecuteToolIntent', 'classifyLlmToolIntent')
    .addConditionalEdges('extractAndStoreKnowledge', node3ConditionalRouter)
    .addEdge('summarizeMessages', END);

  return workflow.compile({ checkpointer });
}
