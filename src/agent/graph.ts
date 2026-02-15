import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateSchema } from '../schemas/types';
import { RedisCheckpointer } from '../memory/RedisCheckpointer';
import {
  classifyLLMToolIntent,
  verifyAndExecuteToolIntent,
  extractAndAddMemory,
  summarizeMessages,
} from './nodes';
import { node1ConditionalRouter, node3ConditionalRouter } from './routers';

export const buildWorkflow = (checkpointer: RedisCheckpointer) => {
  const workflow = new StateGraph(AgentStateSchema)
    .addNode('classifyLlmToolIntent', classifyLLMToolIntent)
    .addNode('verifyAndExecuteToolIntent', verifyAndExecuteToolIntent)
    .addNode('extractAndAddMemory', extractAndAddMemory)
    .addNode('summarizeMessages', summarizeMessages)
    .addEdge(START, 'classifyLlmToolIntent')
    .addConditionalEdges('classifyLlmToolIntent', node1ConditionalRouter)
    .addEdge('verifyAndExecuteToolIntent', 'classifyLlmToolIntent')
    .addConditionalEdges('extractAndAddMemory', node3ConditionalRouter)
    .addEdge('summarizeMessages', END);

  return workflow.compile({ checkpointer });
};
