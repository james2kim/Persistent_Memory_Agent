import type { FlashcardOutput } from '../schemas/flashcardSchemas';

/**
 * Formats flashcards as markdown for the chat UI.
 * Shows numbered cards with front/back and a collapsible answer key.
 */
export const formatFlashcardsAsMarkdown = (flashcards: FlashcardOutput): string => {
  const sections: string[] = [];

  sections.push(`## ${flashcards.title}\n`);

  if (flashcards.topicSummary) {
    sections.push(flashcards.topicSummary);
  }

  sections.push(`*${flashcards.cards.length} flashcards generated. View them in the Quizzes tab for an interactive experience!*\n`);

  for (let i = 0; i < flashcards.cards.length; i++) {
    const card = flashcards.cards[i];
    sections.push(`**${i + 1}. ${card.front}**\n${card.back}`);
  }

  return sections.join('\n\n');
};
