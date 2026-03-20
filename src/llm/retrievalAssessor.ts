import {
  RetrievalGateAssessment,
  RetrievalGateDecision,
  retrievalGateAssessmentSchema,
} from '../schemas/types';
import { haikuModel } from '../agent/constants';
import { withRetry } from '../util/RetryUtil';
import { selectTool } from './toolSelector';

const SYSTEM_PROMPT = `Classify this query for a study assistant.

queryType:
- study_content: questions about documents, notes, academic topics, learning materials
- personal: about user's goals, preferences, progress ("my goal", "what I said")
- general_knowledge: simple facts (capitals, math, definitions)
- conversational: greetings, thanks, meta ("hi", "what can you do?")
- workflow: requests to create, generate, or build something (quizzes, flashcards, study plans, practice tests)
- off_topic: lifestyle/life advice unrelated to studying ("should I nap?", "what to wear")
- unclear: vague, ambiguous, or impossible to classify ("I need information")

referencesPersonalContext: true if query mentions "my", "I", or user-specific info

Examples:
"Explain photosynthesis" → study_content, false
"What's my main goal?" → personal, true
"What is 2+2?" → general_knowledge, false
"Thanks!" → conversational, false
"Make me a quiz about photosynthesis" → workflow, false
"Should I take a nap?" → off_topic, false`;

const modelWithSchema = haikuModel.withStructuredOutput(retrievalGateAssessmentSchema);

interface RuleBasedResult {
  assessment: RetrievalGateAssessment;
}

/**
 * Rule-based pre-filter for obvious query types.
 * Returns assessment if pattern matches, null if LLM should decide.
 * Does NOT handle workflow detection — that's done by the LLM tool selector.
 */
const ruleBasedClassify = (query: string): RuleBasedResult | null => {
  const q = query.trim();
  const lower = q.toLowerCase();

  // Conversational - greetings, thanks, meta
  if (/^(hi|hello|hey|thanks|thank you|bye|goodbye)[\s!.,?]*$/i.test(q)) {
    return { assessment: {
      queryType: 'conversational',
      referencesPersonalContext: false,
      reasoning: 'rule: greeting/thanks',
    }};
  }
  if (/^(what can you do|how do you work|help me|who are you)[\s?]*$/i.test(lower)) {
    return { assessment: {
      queryType: 'conversational',
      referencesPersonalContext: false,
      reasoning: 'rule: meta question',
    }};
  }

  // Off-topic - lifestyle/personal advice patterns (must run BEFORE personal rules)
  if (/\b(should i|would you recommend|can i get.*(advice|recommendation)).*(wear|eat|buy|invest|date|sleep|nap|stock)\b/i.test(lower)) {
    return { assessment: {
      queryType: 'off_topic',
      referencesPersonalContext: false,
      reasoning: 'rule: lifestyle advice',
    }};
  }
  if (/\b(should i|do you think i should)\s+take\b/i.test(lower) && !/\b(notes?|test|exam|class|course)\b/i.test(lower)) {
    return { assessment: {
      queryType: 'off_topic',
      referencesPersonalContext: false,
      reasoning: 'rule: personal medical/supplement advice',
    }};
  }

  // Unclear - vague requests
  if (/^i\s+need\s+(more\s+)?(information|info|details|help|context)\s*\.?$/i.test(q)) {
    return { assessment: {
      queryType: 'unclear',
      referencesPersonalContext: false,
      reasoning: 'rule: vague request needing clarification',
    }};
  }

  // Personal statements
  if (/^i\s+(am|like|prefer|want|need|study|work|have|live|go|usually|always|never)\b/i.test(q)) {
    return { assessment: {
      queryType: 'personal',
      referencesPersonalContext: true,
      reasoning: 'rule: personal statement',
    }};
  }

  // Personal questions
  if (/\b(my|i)\b/i.test(q) && /\?$/.test(q)) {
    return { assessment: {
      queryType: 'personal',
      referencesPersonalContext: true,
      reasoning: 'rule: personal question',
    }};
  }
  if (/^(what('s| is| are| was| were) my|where did i|when did i|how did i)/i.test(lower)) {
    return { assessment: {
      queryType: 'personal',
      referencesPersonalContext: true,
      reasoning: 'rule: personal question',
    }};
  }

  // Study content - explicit topic questions
  if (
    /^(explain|describe|summarize|what is|what are|how does|how do|why does|why do|why is|why are|why was|why were)\s+/i.test(q)
  ) {
    const hasPersonal = /\b(my|me|i)\b/i.test(q);
    if (!hasPersonal) {
      return { assessment: {
        queryType: 'study_content',
        referencesPersonalContext: false,
        reasoning: 'rule: topic question',
      }};
    }
  }

  if (/^(give me|show me|tell me|help me)\s+/i.test(q)) {
    return { assessment: {
      queryType: 'study_content',
      referencesPersonalContext: true,
      reasoning: 'rule: personal request',
    }};
  }

  // General knowledge
  if (
    /^(what is|who is|when was|where is)\s+(the\s+)?(capital|president|population|date|year|definition)/i.test(q)
  ) {
    return { assessment: {
      queryType: 'general_knowledge',
      referencesPersonalContext: false,
      reasoning: 'rule: factual question',
    }};
  }

  // Off-topic - lifestyle advice (catch-all)
  if (/\b(should i|would you recommend).*(wear|eat|buy|invest|date|sleep|nap)\b/i.test(lower)) {
    return { assessment: {
      queryType: 'off_topic',
      referencesPersonalContext: false,
      reasoning: 'rule: lifestyle advice',
    }};
  }

  // No rule matched
  return null;
};

const createFallbackAssessment = (query: string): RetrievalGateAssessment => ({
  queryType: 'unclear',
  referencesPersonalContext: false,
  reasoning: `Fallback for: "${query.slice(0, 30)}"`,
});

export interface AssessorResult {
  assessment: RetrievalGateAssessment;
  matchedWorkflowTool?: string;
}

/**
 * Classifies a query for routing decisions.
 *
 * Three-stage pipeline:
 * 1. Rule-based fast path for obvious non-workflow queries (free, instant)
 * 2. LLM tool selection via Anthropic tool_use (decides if a workflow tool should be invoked)
 * 3. LLM classification fallback for ambiguous queries
 */
export const retrievalGateAssessor = async (query: string): Promise<AssessorResult> => {
  // Stage 1: Rule-based classification (fast, free)
  const ruleResult = ruleBasedClassify(query);
  if (ruleResult) {
    return { assessment: ruleResult.assessment };
  }

  // Stage 2: LLM tool selection — let the model decide if a tool should be used
  const toolResult = await selectTool(query);
  if (toolResult.toolName) {
    return {
      assessment: {
        queryType: 'workflow',
        referencesPersonalContext: false,
        reasoning: `LLM tool selection: ${toolResult.toolName}`,
      },
      matchedWorkflowTool: toolResult.toolName,
    };
  }

  // Stage 3: LLM classification for remaining ambiguous queries
  try {
    const result = await withRetry(
      () => modelWithSchema.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ]),
      { label: 'retrievalGateAssessor' }
    );
    console.log(`[retrievalGateAssessor] LLM-based: ${result.queryType}`);

    // If LLM says workflow but tool selector didn't catch it, try tool selection again
    // This handles edge cases where the classifier detects intent but tool selector missed it
    if (result.queryType === 'workflow') {
      const retryTool = await selectTool(query);
      if (retryTool.toolName) {
        return { assessment: result, matchedWorkflowTool: retryTool.toolName };
      }
    }

    return { assessment: result };
  } catch (error) {
    console.warn('[retrievalGateAssessor] Failed, using fallback:', error);
    return { assessment: createFallbackAssessment(query) };
  }
};

/**
 * Determines retrieval strategy based on query classification.
 */
export const retrievalGatePolicy = (assessment: RetrievalGateAssessment): RetrievalGateDecision => {
  const { queryType, referencesPersonalContext } = assessment;

  // Workflow: retrieve context for generation, route to workflow executor
  if (queryType === 'workflow') {
    return {
      shouldRetrieveDocuments: true,
      shouldRetrieveMemories: true,
      memoryBudget: 'full',
      needsClarification: false,
      needsWorkflow: true,
      reasoning: 'workflow - retrieve context for generation',
    };
  }

  // Off-topic: route to clarification/refusal
  if (queryType === 'off_topic') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: true,
      needsWorkflow: false,
      reasoning: 'off_topic - redirect to clarification/refusal',
    };
  }

  // Unclear: ask clarifying question
  if (queryType === 'unclear') {
    return {
      shouldRetrieveDocuments: false,
      shouldRetrieveMemories: false,
      memoryBudget: 'minimal',
      needsClarification: true,
      needsWorkflow: false,
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
      needsWorkflow: false,
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
      needsWorkflow: false,
      reasoning: 'general_knowledge - retrieve documents',
    };
  }

  // Personal: retrieve both
  if (queryType === 'personal') {
    return {
      shouldRetrieveDocuments: true,
      shouldRetrieveMemories: true,
      memoryBudget: 'full',
      needsClarification: false,
      needsWorkflow: false,
      reasoning: 'personal - retrieve documents and memories',
    };
  }

  // Study content: retrieve both
  return {
    shouldRetrieveDocuments: true,
    shouldRetrieveMemories: true,
    memoryBudget: referencesPersonalContext ? 'full' : 'minimal',
    needsClarification: false,
    needsWorkflow: false,
    reasoning: `study_content - retrieve docs + memories (${referencesPersonalContext ? 'full' : 'minimal'} budget)`,
  };
};
