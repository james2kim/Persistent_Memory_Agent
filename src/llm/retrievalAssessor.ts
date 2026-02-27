import {
  RetrievalGateAssessment,
  RetrievalGateDecision,
  retrievalGateAssessmentSchema,
} from '../schemas/types';
import { haikuModel } from '../agent/constants';

const SYSTEM_PROMPT = `Classify this query for a study assistant.

queryType:
- study_content: questions about documents, notes, academic topics, learning materials
- personal: about user's goals, preferences, progress ("my goal", "what I said")
- general_knowledge: simple facts (capitals, math, definitions)
- conversational: greetings, thanks, meta ("hi", "what can you do?")
- off_topic: lifestyle/life advice unrelated to studying ("should I nap?", "what to wear")
- unclear: vague, ambiguous, or impossible to classify ("I need information")

referencesPersonalContext: true if query mentions "my", "I", or user-specific info

Examples:
"Explain photosynthesis" → study_content, false
"What's my main goal?" → personal, true
"What is 2+2?" → general_knowledge, false
"Thanks!" → conversational, false
"Should I take a nap?" → off_topic, false`;

const modelWithSchema = haikuModel.withStructuredOutput(retrievalGateAssessmentSchema);

const createFallbackAssessment = (query: string): RetrievalGateAssessment => ({
  queryType: 'unclear',
  referencesPersonalContext: false,
  reasoning: `Fallback for: "${query.slice(0, 30)}"`,
});

/**
 * Classifies a query for routing decisions.
 * Query should be pre-processed (references resolved) before calling.
 */
export const retrievalGateAssessor = async (query: string): Promise<RetrievalGateAssessment> => {
  try {
    return await modelWithSchema.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ]);
  } catch (error) {
    console.warn('[retrievalGateAssessor] Failed, using fallback:', error);
    return createFallbackAssessment(query);
  }
};

/**
 * Determines retrieval strategy based on query classification.
 */
export const retrievalGatePolicy = (assessment: RetrievalGateAssessment): RetrievalGateDecision => {
  const { queryType, referencesPersonalContext } = assessment;

  // Off-topic: no retrieval, redirect (not clarification)
  if (queryType === 'off_topic') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: false,
      reasoning: 'off_topic - redirect',
    };
  }

  // Unclear: no retrieval, ask clarifying question
  if (queryType === 'unclear') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: true,
      reasoning: 'unclear - clarify',
    };
  }

  // Conversational: no retrieval
  if (queryType === 'conversational') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: false,
      reasoning: 'conversational - no retrieval',
    };
  }

  // General knowledge: retrieve documents in case we have relevant info
  if (queryType === 'general_knowledge') {
    return {
      shouldRetrieveDocuments: true,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: false,
      reasoning: 'general_knowledge - retrieve documents',
    };
  }

  // Personal: retrieve both documents and memories with full budget
  if (queryType === 'personal') {
    return {
      shouldRetrieveDocuments: true,
      shouldRetrieveMemories: true,
      memoryBudget: 'full',
      needsClarification: false,
      reasoning: 'personal - retrieve documents and memories',
    };
  }

  // Study content: retrieve both documents and memories
  // Use full budget if explicitly personal, minimal otherwise
  return {
    shouldRetrieveDocuments: true,
    shouldRetrieveMemories: true,
    memoryBudget: referencesPersonalContext ? 'full' : 'minimal',
    needsClarification: false,
    reasoning: `study_content - retrieve docs + memories (${referencesPersonalContext ? 'full' : 'minimal'} budget)`,
  };
};
