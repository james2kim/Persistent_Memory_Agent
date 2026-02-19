import type { AgentState } from '../../schemas/types';
import { retrievalGateAssessor, retrievalGatePolicy } from '../../memory/retrievalAssessor';

export const retrievalGate = async (state: AgentState) => {
  const query = state.userQuery;

  // LLM assesses the query characteristics
  const assessment = await retrievalGateAssessor(query);

  // Policy decides what to retrieve based on assessment
  const decision = retrievalGatePolicy(assessment);

  return {
    gateDecision: decision,
  };
};
