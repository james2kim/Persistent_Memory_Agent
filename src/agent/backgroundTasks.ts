import { RedisSessionStore } from '../stores/RedisSessionStore';
import { summarize } from '../llm/summarizeMessages';
import { MAX_MESSAGES } from './constants';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Runs summarization in the background without blocking the response.
 * Called when message count reaches MAX_MESSAGES (40).
 *
 * Strategy:
 * - Summarize oldest 20 messages (merge with existing summary)
 * - Prune to keep newest 20 messages
 */
export async function runBackgroundSummarization(
  sessionId: string,
  userId: string,
  messages: BaseMessage[],
  currentSummary: string
): Promise<void> {
  try {
    console.log(`[backgroundSummarization] Starting for session ${sessionId}`);
    console.log(
      `[backgroundSummarization] Messages: ${messages.length}, Summary length: ${currentSummary.length}`
    );

    // Split: oldest half to summarize, newest half to keep
    const halfPoint = Math.floor(MAX_MESSAGES / 2);
    const messagesToSummarize = messages.slice(0, halfPoint);
    const messagesToKeep = messages.slice(-halfPoint);

    console.log(
      `[backgroundSummarization] Summarizing oldest ${messagesToSummarize.length} messages, keeping newest ${messagesToKeep.length}`
    );

    // Summarize oldest messages + merge with existing summary
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
