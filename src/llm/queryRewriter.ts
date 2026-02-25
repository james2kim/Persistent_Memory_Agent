import { haikuModel } from '../agent/constants';
import { z } from 'zod/v4';

const rewriteSchema = z.object({
  rewrittenQuery: z.string().describe('The query with references resolved, or original if no rewrite needed'),
});

const REWRITE_SYSTEM_PROMPT = `Resolve pronouns (it, this, that) in the query using ONLY the conversation context provided.

IMPORTANT:
- Use the ACTUAL topic from the context, not examples
- If context mentions topic X, replace "this/it/that" with X
- If unsure or no clear topic in context, return the query UNCHANGED
- Never invent or guess topics

Output only the rewritten query string, nothing else.`;

const modelWithSchema = haikuModel.withStructuredOutput(rewriteSchema);

/**
 * Rewrites a query to resolve pronouns and references using conversation context.
 * Returns the original query if no rewrite is needed or possible.
 */
export async function rewriteQuery(
  query: string,
  conversationContext?: string
): Promise<{ rewrittenQuery: string; wasRewritten: boolean }> {
  // Skip rewrite if no context provided
  if (!conversationContext || conversationContext.trim().length === 0) {
    return { rewrittenQuery: query, wasRewritten: false };
  }

  // Quick heuristic: skip if query is already specific (no common pronouns/references)
  const referencePatterns = /\b(it|this|that|these|those|the same|more|again)\b/i;
  if (!referencePatterns.test(query)) {
    return { rewrittenQuery: query, wasRewritten: false };
  }

  try {
    const response = await modelWithSchema.invoke([
      { role: 'system', content: REWRITE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Context:\n${conversationContext}\n\nQuery: "${query}"`,
      },
    ]);

    // Derive wasRewritten by comparing strings
    const wasRewritten = response.rewrittenQuery.toLowerCase() !== query.toLowerCase();

    if (wasRewritten) {
      console.log(`[queryRewriter] "${query}" → "${response.rewrittenQuery}"`);
    }

    return {
      rewrittenQuery: response.rewrittenQuery,
      wasRewritten,
    };
  } catch (error) {
    console.warn('[queryRewriter] Failed to rewrite, using original:', error);
    return { rewrittenQuery: query, wasRewritten: false };
  }
}
