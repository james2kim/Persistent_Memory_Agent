import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import {
  RetrievalGateAssessment,
  RetrievalGateDecision,
  retrievalGateAssessmentSchema,
} from '../schemas/types';
import { haikuModel } from '../agent/constants';

const SYSTEM_MESSAGE = `You are a query assessor for a study assistant. Analyze the user query and provide a structured assessment. Do NOT decide what to retrieve—just describe the query characteristics.

## Field Definitions

### queryType (enum)
- **personal**: About the user (goals, preferences, job, past decisions)
- **study_content**: About uploaded documents, notes, papers, educational material
- **general_knowledge**: Common facts the assistant already knows
- **conversational**: Greetings, small talk, meta-questions
- **off_topic**: Outside study assistant domain (stock tips, medical advice, legal advice, relationship advice)

### ambiguity (low | moderate | high)
- **low**: Clear, specific intent (e.g., "What is my main goal?")
- **moderate**: Somewhat clear but could have multiple interpretations
- **high**: Vague, could mean many things (e.g., "Tell me about it")

### riskWithoutRetrieval (low | moderate | high)
Risk of giving an incorrect or incomplete answer if we skip retrieval:
- **low**: Wrong answer has minimal impact (casual chat)
- **moderate**: Could cause confusion (forgetting a preference)
- **high**: Could cause real problems (contradicting a decision, wrong study info)

### referencesPersonalContext (boolean)
TRUE if query mentions or implies: user's goals, preferences, past decisions, personal facts, "my", "I said", "remind me", etc.

### referencesUploadedContent (boolean)
TRUE if query mentions or implies: documents, notes, papers, "from my notes", specific study topics, uploaded materials.

### reasoning (string, 10-200 chars)
Brief explanation of your assessment.

## Examples

Query: "Hey, how are you?"
→ queryType: conversational, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Simple greeting, no context needed"

Query: "What's my main goal right now?"
→ queryType: personal, ambiguity: low, riskWithoutRetrieval: high
→ referencesPersonalContext: true, referencesUploadedContent: false
→ reasoning: "Directly asks about stored personal goal"

Query: "Explain cellular respiration from my biology notes"
→ queryType: study_content, ambiguity: low, riskWithoutRetrieval: moderate
→ referencesPersonalContext: false, referencesUploadedContent: true
→ reasoning: "Asks about specific content from uploaded materials"

Query: "Based on my study plan, what should I focus on for mitochondria?"
→ queryType: study_content, ambiguity: low, riskWithoutRetrieval: high
→ referencesPersonalContext: true, referencesUploadedContent: true
→ reasoning: "Needs personal study plan + document content"

Query: "What is the capital of France?"
→ queryType: general_knowledge, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "General fact, no retrieval needed"

Query: "What stocks should I buy?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Financial advice is outside study assistant domain"`;

const modelWithAssessmentSchema = haikuModel.withStructuredOutput(retrievalGateAssessmentSchema);

/**
 * LLM-based query assessment. Analyzes the query but does NOT decide retrieval.
 */
export const retrievalGateAssessor = async (query: string): Promise<RetrievalGateAssessment> => {
  const response = await modelWithAssessmentSchema.invoke([
    { role: 'system', content: SYSTEM_MESSAGE },
    { role: 'user', content: query },
  ]);
  return response;
};

/**
 * Deterministic policy that takes assessment and decides what to retrieve.
 *
 * Philosophy: Retrieve by default. The cost of missing relevant context is
 * higher than the cost of searching unnecessarily. Only skip for pure
 * conversational queries (greetings, small talk).
 */
export const retrievalGatePolicy = (assessment: RetrievalGateAssessment): RetrievalGateDecision => {
  // Skip retrieval for conversational and off-topic queries
  if (assessment.queryType === 'conversational' || assessment.queryType === 'off_topic') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: false,
      reasoning: `${assessment.queryType} query, no retrieval needed`,
    };
  }

  // For everything else: search documents by default
  // User may have uploaded docs on any topic (React, ReAct, etc.)
  const shouldRetrieveDocuments = true;

  // Search memories if personal context is involved
  const shouldRetrieveMemories =
    assessment.referencesPersonalContext ||
    assessment.queryType === 'personal';

  // Only clarify if highly ambiguous AND no clear direction
  const needsClarification =
    assessment.ambiguity === 'high' &&
    !assessment.referencesPersonalContext &&
    !assessment.referencesUploadedContent;

  return {
    shouldRetrieveDocuments,
    shouldRetrieveMemories,
    needsClarification,
    reasoning: `Retrieve by default: docs=${shouldRetrieveDocuments}, mems=${shouldRetrieveMemories}`,
  };
};
