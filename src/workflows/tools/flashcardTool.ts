import type { WorkflowTool, WorkflowContext, WorkflowResult } from '../types';
import type { WorkflowRun } from '../WorkflowRun';
import { WorkflowRunner } from '../WorkflowRunner';
import type { ErrorMapping } from '../WorkflowRunner';
import { WorkflowStepError } from '../errors';
import { extractFlashcardIntent, generateFlashcards } from '../../llm/flashcardGenerator';
import type { LLMUsage } from '../../llm/flashcardGenerator';
import { validateFlashcards } from '../../llm/flashcardValidator';
import { formatFlashcardsAsMarkdown } from '../../llm/flashcardFormatter';
import { buildContextBlock } from '../../llm/promptBuilder';
import type { FlashcardInput, FlashcardOutput } from '../../schemas/flashcardSchemas';
import { wlog } from '../../util/WorkflowLogger';

interface IntentArtifact {
  data: FlashcardInput;
  usage: LLMUsage;
  durationMs: number;
}

interface GenerationArtifact {
  data: FlashcardOutput;
  usage: LLMUsage;
  durationMs: number;
}

interface ValidationArtifact {
  valid: true;
  warnings: string[];
}

const logUsage = (label: string, model: string, usage: LLMUsage, durationMs: number) => {
  const tokenInfo =
    usage.inputTokens != null ? ` (in=${usage.inputTokens}, out=${usage.outputTokens})` : '';
  wlog.log(
    `[flashcardTool] ${label} ${model} completed in ${(durationMs / 1000).toFixed(2)}s${tokenInfo}`
  );
};

const FLASHCARD_ERROR_MAP: ErrorMapping[] = [
  {
    code: 'INTENT_EXTRACTION_FAILED',
    message:
      'I couldn\'t understand the flashcard parameters from your request. Could you try rephrasing? For example: "Make me flashcards about photosynthesis".',
    errorType: 'intent_extraction_failed',
  },
  {
    code: 'GENERATION_FAILED',
    message:
      'I had trouble generating the flashcards. Could you try again? If the problem persists, try a simpler request.',
    errorType: 'generation_failed',
  },
  {
    code: 'VALIDATION_FAILED',
    message:
      "The generated flashcards had some issues. Could you try again?",
    errorType: 'validation_failed',
  },
];

export const flashcardTool: WorkflowTool = {
  name: 'flashcard_generation',
  description:
    'Generates flashcards from study materials. Use when the user wants to create flashcards, study cards, or review cards.',
  keywords: [
    /\b(flashcard|flash\s*card)s?\b/i,
    /\b(make|create|generate|give|write)\b.*\b(flashcard|flash\s*card|card)s?\b/i,
    /\bstudy\s+cards?\b/i,
    /\breview\s+cards?\b/i,
  ],

  async execute(ctx: WorkflowContext, run: WorkflowRun): Promise<WorkflowResult> {
    const runner = new WorkflowRunner(ctx.trace, run, ctx.sessionId);
    const { userQuery, contextBlock, conversationContext } = ctx;

    return runner.execute(async () => {
      // ---- Step 1: Extract flashcard intent ----
      const intent = await runner.runStep<IntentArtifact>(
        'intentExtraction',
        'flashcardIntentExtraction',
        async () => {
          const start = Date.now();
          const res = await extractFlashcardIntent(userQuery, contextBlock, conversationContext);
          const durationMs = Date.now() - start;

          if (!res) {
            throw new WorkflowStepError(
              'INTENT_EXTRACTION_FAILED',
              'Failed to extract flashcard intent from user query'
            );
          }

          logUsage('intentExtraction', 'haiku', res.usage, durationMs);
          return { data: res.data, usage: res.usage, durationMs };
        },
        {
          timeoutMs: 45_000,
          progressLabel: 'Understanding your request...',
          spanMeta: (a) => ({
            success: true,
            topic: a.data.topic,
            cardCount: a.data.cardCount,
            difficulty: a.data.difficulty,
          }),
        }
      );

      const input = intent.data;

      // ---- Step 2: Context enrichment ----
      // Always retrieve based on the extracted topic. The initial retrieval used
      // the raw user query ("make me flashcards on MMR") which may have matched wrong docs.
      // Topic-based retrieval grounds the content in the right documents.
      let activeContextBlock = contextBlock;
      {
        const retrievalResult = await runner.runStep<{ chunksAdded: number; finalLength: number }>(
          'contextRetrieval',
          'workflowContextRetrieval',
          async () => {
            wlog.log(
              `[flashcardTool] Context thin (${activeContextBlock?.length ?? 0} chars), retrieving for topic: "${input.topic}"`
            );
            const retrieved = await ctx.retrieve(input.topic);
            let chunksAdded = 0;
            if (retrieved.length > 0) {
              const existingIds = new Set(ctx.documents.map((d) => d.id));
              const newChunks = retrieved.filter((c) => !existingIds.has(c.id));
              if (newChunks.length > 0) {
                const normalized = newChunks.map((c) => ({
                  ...c,
                  confidence: Math.min(c.confidence, 0.3),
                }));
                const allDocs = [...ctx.documents, ...normalized];
                activeContextBlock = buildContextBlock(allDocs, ctx.memories);
                chunksAdded = newChunks.length;
              }
            }
            return { chunksAdded, finalLength: activeContextBlock?.length ?? 0 };
          },
          {
            durable: false,
            progressLabel: 'Finding relevant study materials...',
            spanMeta: (a) => ({
              chunksAdded: a.chunksAdded,
              finalContextLength: a.finalLength,
            }),
          }
        );

        wlog.log(
          `[flashcardTool] Retrieval complete: ${retrievalResult.chunksAdded} chunks added, context now ${retrievalResult.finalLength} chars`
        );
      }

      if (!activeContextBlock || activeContextBlock.length < 100) {
        return runner.failure(
          `I don't have enough study materials on "${input.topic}" to create flashcards from. Please upload some documents or notes first, then try again.`,
          'insufficient_context'
        );
      }

      // ---- Step 3: Generate flashcards ----
      const gen = await runner.runStep<GenerationArtifact>(
        'flashcardGeneration',
        'flashcardGeneration',
        async () => {
          const start = Date.now();
          const res = await generateFlashcards(input, activeContextBlock!);
          const durationMs = Date.now() - start;

          if (!res) {
            throw new WorkflowStepError('GENERATION_FAILED', 'Flashcard generation returned no result');
          }

          logUsage('flashcardGeneration', 'sonnet', res.usage, durationMs);
          return { data: res.data, usage: res.usage, durationMs };
        },
        {
          timeoutMs: 120_000,
          progressLabel: 'Generating flashcards...',
          spanMeta: (a) => ({
            success: true,
            cardsGenerated: a.data.cards.length,
            title: a.data.title,
          }),
        }
      );

      const flashcards = gen.data;

      // Check if the LLM signaled topic not found
      if (flashcards.title === 'TOPIC_NOT_FOUND' || flashcards.cards.length === 0) {
        return runner.failure(
          `I don't have study materials on "${input.topic}" to create flashcards from. Please upload some documents or notes on this topic first, then try again.`,
          'insufficient_context'
        );
      }

      // ---- Step 4: Validate ----
      await runner.runStep<ValidationArtifact>(
        'flashcardValidation',
        'flashcardValidation',
        async () => {
          const validation = validateFlashcards(flashcards, input);

          if (!validation.valid) {
            wlog.warn('[flashcardTool] Validation failed:', validation.errors);
            throw new WorkflowStepError('VALIDATION_FAILED', 'Flashcard validation failed', {
              validationErrors: validation.errors,
            });
          }

          if (validation.warnings.length > 0) {
            wlog.log('[flashcardTool] Validation warnings:', validation.warnings);
          }

          return { valid: true as const, warnings: validation.warnings };
        },
        {
          durable: false,
          progressLabel: 'Checking flashcard quality...',
          spanMeta: (a) => ({
            valid: true,
            warningCount: a.warnings.length,
          }),
        }
      );

      // ---- Step 5: Format output ----
      let response = formatFlashcardsAsMarkdown(flashcards);
      if (flashcards.cards.length < input.cardCount) {
        response += `\n\n*Note: I was able to generate ${flashcards.cards.length} of the ${input.cardCount} requested flashcards from your study materials.*`;
      }

      const result = runner.success(response, flashcards);
      wlog.log(
        `[flashcardTool] Total tokens: in=${result.totalInputTokens}, out=${result.totalOutputTokens}`
      );

      return result;
    }, FLASHCARD_ERROR_MAP);
  },
};
