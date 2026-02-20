import { RedisSessionStore } from '../stores/RedisSessionStore';
import { summarize } from '../memory/summarizeMessages';
import { MAX_MESSAGES } from './constants';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Runs summarization in the background without blocking the response.
 * Called after the main response is sent to the user.
 */
export async function runBackgroundSummarization(
  sessionId: string,
  userId: string,
  messages: BaseMessage[],
  currentSummary: string
): Promise<void> {
  try {
    console.log(`[backgroundSummarization] Starting for session ${sessionId}`);
    console.log(`[backgroundSummarization] Messages: ${messages.length}, Summary length: ${currentSummary.length}`);

    // Determine how many messages to summarize (first half)
    const cutIndex = Math.floor(MAX_MESSAGES / 2);
    const messagesToSummarize = messages.slice(0, cutIndex);
    const messagesToKeep = messages.slice(cutIndex);

    console.log(`[backgroundSummarization] Summarizing ${messagesToSummarize.length} messages, keeping ${messagesToKeep.length}`);

    // Run summarization
    const result = await summarize(currentSummary, messagesToSummarize);

    console.log(`[backgroundSummarization] New summary length: ${result.content.length}`);

    // Update the checkpoint directly (source of truth for LangGraph)
    const checkpointKey = `checkpoint:${sessionId}:latest`;
    const client = RedisSessionStore.getClient();
    const checkpointRaw = await client.get(checkpointKey);

    if (checkpointRaw) {
      const checkpoint = JSON.parse(checkpointRaw);
      if (checkpoint.checkpoint?.channel_values) {
        checkpoint.checkpoint.channel_values.summary = result.content;
        checkpoint.checkpoint.channel_values.messages = messagesToKeep;
        await client.set(checkpointKey, JSON.stringify(checkpoint));

        // Also sync to session store for UI reads
        const { state } = await RedisSessionStore.getSession(sessionId, userId);
        await RedisSessionStore.writeSession(sessionId, {
          ...state,
          summary: result.content,
          // Convert BaseMessages to plain objects for session store
          messages: messagesToKeep.map((m) => ({
            id: (m.id as string) ?? '',
            role: m.constructor.name === 'HumanMessage' ? 'user' : 'assistant',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            createdAt: new Date().toISOString(),
          })),
        });
      }
    }

    console.log(`[backgroundSummarization] Complete for session ${sessionId}`);
  } catch (err) {
    console.error('[backgroundSummarization] Error:', err);
  }
}
