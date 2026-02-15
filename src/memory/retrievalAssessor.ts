import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ChatAnthropic } from '@langchain/anthropic';

import { RetrievalGateAssessment, retrievalGateAssessmentSchema } from '../schemas/types';

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-5-20250929',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_MESSAGE = `You are a retrieval gate assessor for a persistent memory system. Your job is to analyze a user query and determine whether retrieving information from long-term memory is necessary to answer it correctly.

## Your Task

Given a user query, assess:
1. Whether the query requires external truth (stored memories) to answer accurately
2. The ambiguity level of the query
3. The risk of providing an incorrect or incomplete answer without memory retrieval

## Field Definitions

### requiresExternalTruth (boolean)
Set to TRUE if the query:
- Asks about the user's personal information (name, job, preferences, goals)
- References past decisions, plans, or commitments
- Asks "what did I say", "what do you know about me", "remind me", etc.
- Requires context from previous conversations
- Asks about user-specific facts that cannot be inferred from the current message

Set to FALSE if:
- The query is general knowledge (e.g., "what is Python?")
- The query is self-contained and requires no personal context
- The query is a greeting or small talk
- The answer can be fully derived from the current message alone

### ambiguity (low | moderate | high)
- **low**: Clear, specific query with obvious intent (e.g., "What is my name?")
- **moderate**: Somewhat clear but could have multiple interpretations (e.g., "What was that thing I mentioned?")
- **high**: Vague or unclear query that could mean many things (e.g., "Tell me about it")

### risk (low | moderate | high)
Risk of providing an incorrect/incomplete answer WITHOUT memory retrieval:
- **low**: Wrong answer has minimal impact (e.g., casual conversation)
- **moderate**: Wrong answer could cause confusion or minor issues (e.g., forgetting a stated preference)
- **high**: Wrong answer could cause significant problems (e.g., forgetting a critical goal, contradicting a past decision)

### notes (string, 10-200 chars)
Brief explanation of your assessment. Focus on WHY you made this determination.

## Examples

Query: "Hey, how are you?"
→ requiresExternalTruth: false, ambiguity: low, risk: low
→ notes: "Greeting/small talk, no personal context needed"

Query: "What's my main goal right now?"
→ requiresExternalTruth: true, ambiguity: low, risk: high
→ notes: "Directly asks about stored goal, wrong answer would mislead user"

Query: "Can you help me with that project?"
→ requiresExternalTruth: true, ambiguity: high, risk: moderate
→ notes: "References unspecified project, needs context from memory"

Query: "Explain how async/await works in JavaScript"
→ requiresExternalTruth: false, ambiguity: low, risk: low
→ notes: "General knowledge question, no personal context required"`;

const modelWithMemoryStructure = model.withStructuredOutput(retrievalGateAssessmentSchema);

export const retrievalGateAssessor = async (prompt: string) => {
  const response = await modelWithMemoryStructure.invoke([
    { role: 'system', content: SYSTEM_MESSAGE },
    { role: 'user', content: prompt },
  ]);
  return response;
};

export const retrievalGatePolicy = (gate: RetrievalGateAssessment) => {
  if (gate.ambiguity == 'high') {
    return 'clarify_question';
  }
  if (gate.requiresExternalTruth || gate.risk === 'high') {
    return 'retrieve_memories';
  }
  return 'answer_without_retrieval';
};
