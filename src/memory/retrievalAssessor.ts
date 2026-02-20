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
→ reasoning: "General fact, no retrieval needed"`;

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
 * Adjust these rules to tune retrieval behavior.
 */
export const retrievalGatePolicy = (assessment: RetrievalGateAssessment): RetrievalGateDecision => {
  // 0) Conversational queries: no retrieval
  if (assessment.queryType === 'conversational') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: false,
      reasoning: 'Conversational query, no retrieval needed',
    };
  }

  // 1) High ambiguity: clarifying question needed.
  // Allow retrieval as hints when the query clearly points at memories/docs.
  if (assessment.ambiguity === 'high') {
    const memHint = assessment.referencesPersonalContext || assessment.queryType === 'personal';
    const docHint =
      assessment.referencesUploadedContent || assessment.queryType === 'study_content';

    // Only need clarification if we have no retrieval hints
    const hasHints = memHint || docHint;

    return {
      shouldRetrieveDocuments: docHint,
      shouldRetrieveMemories: memHint,
      needsClarification: !hasHints,
      reasoning: hasHints
        ? 'High ambiguity but have context hints; retrieve then clarify if needed'
        : 'High ambiguity with no context hints; clarification needed',
    };
  }

  // 2) General knowledge: if low risk, answer directly; if not low risk, clarify constraints.
  if (assessment.queryType === 'general_knowledge') {
    if (assessment.riskWithoutRetrieval === 'low') {
      return {
        shouldRetrieveDocuments: false,
        shouldRetrieveMemories: false,
        needsClarification: false,
        reasoning: 'General knowledge, assistant can answer directly',
      };
    }

    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      needsClarification: true,
      reasoning: 'High-stakes general query: clarify constraints before answering',
    };
  }

  // 3) Determine retrieval based on strong signals (references flags) + risk as a booster
  const shouldRetrieveMemories =
    assessment.referencesPersonalContext ||
    (assessment.queryType === 'personal' && assessment.riskWithoutRetrieval !== 'low');

  // Search documents if:
  // - Explicitly references uploaded content, OR
  // - Query is study_content type with non-low risk, OR
  // - High risk personal query (facts like severance, contracts could be in docs)
  const shouldRetrieveDocuments =
    assessment.referencesUploadedContent ||
    (assessment.queryType === 'study_content' && assessment.riskWithoutRetrieval !== 'low') ||
    (assessment.queryType === 'personal' && assessment.riskWithoutRetrieval === 'high');

  return {
    shouldRetrieveDocuments,
    shouldRetrieveMemories,
    needsClarification: false,
    reasoning: `Policy: docs=${shouldRetrieveDocuments}, mems=${shouldRetrieveMemories}`,
  };
};
