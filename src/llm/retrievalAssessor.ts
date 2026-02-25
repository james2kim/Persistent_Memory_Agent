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
Classify based on what the query is ABOUT. Use off_topic as the DEFAULT if the query doesn't clearly fit the other categories.

- **study_content**: Questions about academic subjects, research, uploaded documents, notes, or papers. The user is trying to LEARN something.
- **personal**: About the user's STUDY-RELATED context: their learning goals, study preferences, progress, or decisions about their education.
- **general_knowledge**: Factual questions about academic topics (science, history, math, geography, etc.) that don't require the user's documents.
- **conversational**: Greetings ("hi", "thanks"), meta-questions about the assistant ("what can you do?"), or simple acknowledgments.
- **off_topic**: ANYTHING that doesn't fit the above categories. This includes ALL personal life advice, lifestyle questions, recommendations, opinions, or decisions unrelated to academics. When in doubt, classify as off_topic.

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

Query: "Is finasteride better than dutasteride?"
→ queryType: study_content, ambiguity: low, riskWithoutRetrieval: moderate
→ referencesPersonalContext: false, referencesUploadedContent: true
→ reasoning: "Comparing medications academically - likely has research/notes on this"

Query: "Explain the legal precedent in Brown v. Board of Education"
→ queryType: study_content, ambiguity: low, riskWithoutRetrieval: moderate
→ referencesPersonalContext: false, referencesUploadedContent: true
→ reasoning: "Academic legal/history question"

Query: "What stocks should I buy?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Personal life advice, not academic"

Query: "Should I take a nap?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Personal life decision, not academic"

Query: "What should I wear today?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Personal lifestyle question, not academic"

Query: "Should I go to the gym or stay home?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Personal life decision, not academic"

Query: "What do you think about the weather?"
→ queryType: off_topic, ambiguity: low, riskWithoutRetrieval: low
→ referencesPersonalContext: false, referencesUploadedContent: false
→ reasoning: "Casual question, not academic"`;

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
  // Off-topic queries: redirect politely via clarification response
  if (assessment.queryType === 'off_topic') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: true,
      reasoning: 'off_topic query, politely redirect',
    };
  }

  // Conversational queries: answer directly without retrieval
  if (assessment.queryType === 'conversational') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: false,
      reasoning: 'conversational query, no retrieval needed',
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
