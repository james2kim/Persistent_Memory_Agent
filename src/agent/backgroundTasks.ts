import { RedisSessionStore } from '../stores/RedisSessionStore';
import { summarize } from '../llm/summarizeMessages';
import { extractKnowledge } from '../llm/extractKnowledge';
import { MemoryStore } from '../stores/MemoryStore';
import { DocumentStore } from '../stores/DocumentStore';
import { defaultEmbedding } from '../services/EmbeddingService';
import { ingestDocument } from '../ingest/ingestDocument';
import { db } from '../db/knex';
import { MESSAGES_TO_SUMMARIZE, MESSAGES_TO_KEEP } from './constants';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Runs summarization in the background without blocking the response.
 * Called when message count reaches MAX_MESSAGES (15).
 *
 * Strategy:
 * - Summarize oldest 10 messages (merge with existing summary)
 * - Prune to keep newest 5 messages
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

    // Split: oldest N to summarize, newest M to keep
    const messagesToSummarize = messages.slice(0, MESSAGES_TO_SUMMARIZE);
    const messagesToKeep = messages.slice(-MESSAGES_TO_KEEP);

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

const documentStore = new DocumentStore(db, 1024);

/**
 * Runs knowledge extraction in the background without blocking the response.
 * Extracts memories or study materials from user queries.
 */
export async function runBackgroundExtraction(
  userQuery: string,
  userId: string
): Promise<void> {
  try {
    console.log(`[backgroundExtraction] Starting for query: "${userQuery.slice(0, 50)}..."`);

    const extraction = await extractKnowledge(userQuery);

    if (!extraction) {
      console.log('[backgroundExtraction] No knowledge to extract');
      return;
    }

    if (extraction.contentType === 'study_material' && extraction.studyMaterial) {
      const { title, content, subject } = extraction.studyMaterial;

      await ingestDocument(
        db,
        { documents: documentStore },
        {
          source: `chat:${Date.now()}`,
          title,
          text: content,
          metadata: {
            source: 'chat',
            subject: subject ?? 'general',
            ingestedAt: new Date().toISOString(),
          },
        },
        userId
      );
      console.log(`[backgroundExtraction] Ingested study material: "${title}"`);
    } else if (extraction.contentType === 'personal_memory' && extraction.memories) {
      const validMemories = extraction.memories.filter((mem) => mem.worth_keeping);
      let added = 0;

      for (const mem of validMemories) {
        const embedding = await defaultEmbedding.embedText(mem.content);
        const memory = {
          user_id: userId,
          type: mem.type,
          confidence: mem.confidence,
          content: mem.content,
          created_at: new Date().toISOString(),
          embedding,
        };
        const result = await MemoryStore.addMemory(memory, embedding);
        if (result) added++;
      }

      if (added > 0) {
        console.log(`[backgroundExtraction] Added ${added} memories`);
      }
    }

    console.log('[backgroundExtraction] Complete');
  } catch (err) {
    console.error('[backgroundExtraction] Error:', err);
  }
}
