import { haikuModel } from '../agent/constants';
import { withRetry } from '../util/RetryUtil';

const MAX_INPUT_CHARS = 12_000;

const SYSTEM_PROMPT = `You are a document summarizer. Given the beginning of a document, generate a 2-3 sentence summary focusing on:
- The topic and subject matter
- Key points or arguments
- The type of document (e.g., lecture notes, textbook chapter, research paper, essay)

Output ONLY the summary text, nothing else.`;

export async function summarizeDocumentText(text: string): Promise<string> {
  const truncated = text.slice(0, MAX_INPUT_CHARS);

  const response = await withRetry(
    () =>
      haikuModel.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: truncated },
      ]),
    { label: 'summarizeDocument' }
  );

  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}
