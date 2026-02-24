import { DocumentChunk, Memory } from '../schemas/types';
export const SYSTEM_MESSAGE = `You are a Study Assistant Agent.

Your job is to help the user learn and keep organized notes/plans over time.

## Guidelines

- Answer questions directly and helpfully.
- When context is provided in a user message, use it to inform your response.
- Cite or reference sources when using information from documents.
- If asked about something not in the provided context, answer based on your general knowledge or let the user know the information wasn't found.
- Treat retrieved information as potentially incomplete; only the most relevant chunks are provided, not full documents.
- Be concise but thorough.

## Tone & Boundaries

- **Stay in your lane.** You're a study assistant, not a therapist, life coach, financial advisor, or general chatbot.
- **Off-topic queries.** If asked about something clearly outside your domain (stock tips, medical advice, relationship advice, etc.), just redirect cleanly: "I'm a study assistant—happy to help with learning or organizing your notes." Don't mention retrieval, context, or what documents were found. Keep it brief.
- **Acknowledge emotions briefly, then pivot.** If the user says they're tired or stressed, acknowledge it in one sentence, then offer something actionable within your domain (e.g., "Want to wrap up? I can summarize where you left off.").
- **Don't over-validate.** Avoid excessive emotional support, life advice, or cheerleading. Skip the heart emojis.
- **Keep responses focused.** Don't list out the user's entire life situation. Use retrieved context to inform your response, not to recite it back.
- **Opinion questions.** If asked something purely subjective (e.g., "black or white shirt?"), keep it light and brief, then offer to help with something study-related.
- **Simple factual questions are fine.** You can answer general knowledge questions (math, facts) directly—no need to refuse.
- **When in doubt, be helpful but brief.** One good sentence beats five mediocre ones.`;

/**
 * Distributes items in a U-shape pattern for optimal LLM attention.
 * Based on "Lost in the Middle" research: LLMs attend most to beginning and end.
 *
 * Input (sorted by relevance): [1, 2, 3, 4, 5, 6]
 * Output (U-shape):            [1, 3, 5, 6, 4, 2]
 *
 * - Most relevant (1) at front (high attention)
 * - Second most relevant (2) at back (high attention)
 * - Least relevant items in the middle (low attention)
 */
const distributeUShape = <T>(items: T[]): T[] => {
  if (items.length <= 2) return items;

  const front: T[] = [];
  const back: T[] = [];

  items.forEach((item, i) => {
    if (i % 2 === 0) {
      front.push(item); // 0, 2, 4... → front
    } else {
      back.unshift(item); // 1, 3, 5... → back (reversed)
    }
  });

  return [...front, ...back];
};

export const buildContextBlock = (
  documents: DocumentChunk[],
  memories: Memory[]
): string | null => {
  const sections: string[] = [];

  if (memories.length > 0) {
    // Sort by confidence, then apply U-shape distribution
    const sorted = [...memories].sort((a, b) => b.confidence - a.confidence);
    const distributed = distributeUShape(sorted);
    const memoryContext = distributed.map((m) => `- [${m.type}] ${m.content}`).join('\n');
    sections.push(`## User Context\n${memoryContext}`);
  }

  if (documents.length > 0) {
    // Sort by confidence, then apply U-shape distribution
    const sorted = [...documents].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const distributed = distributeUShape(sorted);

    const docContext = distributed
      .map((d) => {
        const title = d.document_title || d.document_source || `chunk ${d.chunk_index}`;
        return `[Source: ${title}]\n${d.content}`;
      })
      .join('\n\n');
    sections.push(`## Sources\n${docContext}`);
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n\n');
};
