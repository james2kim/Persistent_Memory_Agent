import { haikuModel, sonnetModel } from '../agent/constants';
import { withRetry } from '../util/RetryUtil';
import { flashcardInputSchema, flashcardOutputSchema } from '../schemas/flashcardSchemas';
import type { FlashcardInput, FlashcardOutput } from '../schemas/flashcardSchemas';
import type { AIMessageChunk } from '@langchain/core/messages';
import { OutputParserException } from '@langchain/core/output_parsers';
import { wlog } from '../util/WorkflowLogger';

export interface LLMUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LLMResult<T> {
  data: T;
  usage: LLMUsage;
}

// ============================================================================
// STEP 1: Extract flashcard intent from natural language
// ============================================================================

const INTENT_EXTRACTION_PROMPT = `You are a flashcard parameter extractor. Given a user's natural language request for flashcards, extract structured parameters.

## Rules
- "topic" should be a concise description of what the flashcards cover
- Default to 10 cards if not specified
- Default to "medium" difficulty if not specified
- Only set focusAreas if the user explicitly mentions specific subtopics or areas to focus on
- For the "topic" field, use the user's EXACT words. Do NOT expand acronyms or add interpretations.
  For example: if the user says "MMR", set topic to "MMR" — NOT "MMR (Measles, Mumps, Rubella Vaccine)" or any other expansion.`;

const intentModel = haikuModel.withStructuredOutput(flashcardInputSchema, { includeRaw: true });

export const extractFlashcardIntent = async (
  userQuery: string,
  documentContext?: string | null,
  conversationContext?: string | null
): Promise<LLMResult<FlashcardInput> | null> => {
  try {
    let userContent = `User request: ${userQuery}`;
    if (conversationContext) {
      userContent += `\n\nRecent conversation (use this to resolve references like "it", "this topic", etc.):\n${conversationContext}`;
    }
    if (documentContext) {
      userContent += `\n\nAvailable study material topics:\n${documentContext}`;
    }

    const result = await withRetry(
      (signal) =>
        intentModel.invoke(
          [
            { role: 'system', content: INTENT_EXTRACTION_PROMPT },
            { role: 'user', content: userContent },
          ],
          { signal }
        ),
      { label: 'extractFlashcardIntent' }
    );

    const parsed = flashcardInputSchema.safeParse(result.parsed);
    if (!parsed.success) {
      wlog.warn(
        '[extractFlashcardIntent] Schema validation failed:',
        parsed.error.issues.map((i) => i.message)
      );
      return null;
    }

    const usageMeta = (result.raw as AIMessageChunk).usage_metadata;
    return {
      data: parsed.data,
      usage: {
        inputTokens: usageMeta?.input_tokens ?? null,
        outputTokens: usageMeta?.output_tokens ?? null,
      },
    };
  } catch (err) {
    if (err instanceof OutputParserException) {
      wlog.warn('[extractFlashcardIntent] LLM output parse failure (expected):', err.message);
      return null;
    }
    wlog.error('[extractFlashcardIntent] Unexpected error (propagating):', err);
    throw err;
  }
};

// ============================================================================
// STEP 2: Generate flashcards from structured input + context
// ============================================================================

const buildFlashcardPrompt = (input: FlashcardInput, contextBlock: string): string => {
  return `You are a flashcard generator for a study assistant. Generate flashcards based on the provided study materials.

## Flashcard Parameters
- Topic: ${input.topic}
- Number of cards: ${input.cardCount}
- Difficulty: ${input.difficulty}
${input.focusAreas?.length ? `- Focus areas: ${input.focusAreas.join(', ')}` : ''}

## Rules
1. ALL flashcards MUST be grounded in the provided study materials. Do not make up facts.
   - If the study materials do NOT contain information about the requested topic, set the title to "TOPIC_NOT_FOUND" and generate 0 cards (empty array).
   - NEVER use your general knowledge to fill gaps. Only use information explicitly present in the study materials below.
2. The "front" should be a clear question, term, or concept prompt.
3. The "back" should be a concise but complete answer or definition.
4. No duplicate cards.
5. Vary card types: definitions, concepts, comparisons, cause-effect, application.
6. Adjust complexity for the requested difficulty:
   - easy: basic definitions and recall
   - medium: understanding and relationships
   - hard: analysis, application, and synthesis
7. The title should describe the flashcard set concisely.
8. The topicSummary should be a brief 2-3 sentence overview of the topic, based on the study materials.

## Study Materials
${contextBlock}`;
};

const flashcardModel = sonnetModel.withStructuredOutput(flashcardOutputSchema, { includeRaw: true });

export const generateFlashcards = async (
  input: FlashcardInput,
  contextBlock: string
): Promise<LLMResult<FlashcardOutput> | null> => {
  try {
    const systemPrompt = buildFlashcardPrompt(input, contextBlock);

    const result = await withRetry(
      (signal) =>
        flashcardModel.invoke(
          [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Generate ${input.cardCount} ${input.difficulty} flashcards about "${input.topic}".`,
            },
          ],
          { signal }
        ),
      { label: 'generateFlashcards' }
    );

    const parsed = flashcardOutputSchema.safeParse(result.parsed);
    if (!parsed.success) {
      wlog.warn(
        '[generateFlashcards] Schema validation failed:',
        parsed.error.issues.map((i) => i.message)
      );
      return null;
    }

    const usageMeta = (result.raw as AIMessageChunk).usage_metadata;
    return {
      data: parsed.data,
      usage: {
        inputTokens: usageMeta?.input_tokens ?? null,
        outputTokens: usageMeta?.output_tokens ?? null,
      },
    };
  } catch (err) {
    if (err instanceof OutputParserException) {
      wlog.warn('[generateFlashcards] LLM output parse failure (expected):', err.message);
      return null;
    }
    wlog.error('[generateFlashcards] Unexpected error (propagating):', err);
    throw err;
  }
};
