import type { FlashcardOutput, FlashcardInput, FlashcardValidationResult } from '../schemas/flashcardSchemas';

/**
 * Validates generated flashcards against input parameters.
 * Pure deterministic checks — no LLM calls.
 */
export const validateFlashcards = (
  flashcards: FlashcardOutput,
  input: FlashcardInput
): FlashcardValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Card count ---
  if (flashcards.cards.length !== input.cardCount) {
    warnings.push(
      `Requested ${input.cardCount} cards but got ${flashcards.cards.length}`
    );
  }

  const seenFronts = new Set<string>();

  for (let i = 0; i < flashcards.cards.length; i++) {
    const card = flashcards.cards[i];
    const label = `Card ${i + 1}`;

    // --- Front must be substantive ---
    if (card.front.trim().length < 5) {
      errors.push(`${label}: front is too short`);
    }

    // --- Back must be substantive ---
    if (card.back.trim().length < 10) {
      errors.push(`${label}: back is too short`);
    }

    // --- Duplicate fronts ---
    const normalizedFront = card.front.toLowerCase().trim();
    if (seenFronts.has(normalizedFront)) {
      errors.push(`${label}: duplicate front text`);
    }
    seenFronts.add(normalizedFront);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};
