import { RetrievalGateAssessment, RetrievalGateDecision, retrievalGateAssessmentSchema } from '../schemas/types';
import { haikuModel } from '../agent/constants';

const SYSTEM_PROMPT = `Classify this query for a study assistant.

queryType:
- study_content: questions about documents, notes, academic topics, learning materials
- personal: about user's goals, preferences, progress ("my goal", "what I said")
- general_knowledge: simple facts (capitals, math, definitions)
- conversational: greetings, thanks, meta ("hi", "what can you do?")
- off_topic: lifestyle/life advice unrelated to studying ("should I nap?", "what to wear")
- unclear: empty or impossible to classify

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

  // No retrieval, needs redirect
  if (queryType === 'off_topic' || queryType === 'unclear') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: true,
      reasoning: `${queryType} - redirect`,
    };
  }

  // No retrieval needed
  if (queryType === 'conversational') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: false,
      reasoning: 'conversational - no retrieval',
    };
  }

  // Retrieval needed
  return {
    shouldRetrieveDocuments: true,
    shouldRetrieveMemories: referencesPersonalContext || queryType === 'personal',
    needsClarification: false,
    reasoning: `${queryType} - retrieve`,
  };
};
