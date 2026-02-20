import type { AgentState } from '../../schemas/types';
import { extractKnowledge } from '../../memory/extractKnowledge';
import { MemoryStore } from '../../stores/MemoryStore';
import { DocumentStore } from '../../stores/DocumentStore';
import { getUserId } from '../../config';
import { defaultEmbedding } from '../../services/EmbeddingService';
import { ingestDocument } from '../../ingest/ingestDocument';
import { db } from '../../db/knex';

const documentStore = new DocumentStore(db, 1024);

export const extractAndStoreKnowledge = async (state: AgentState) => {
  const userId = getUserId();

  // Classify and extract knowledge from user query
  const extraction = await extractKnowledge(state.userQuery);

  // Handle extraction failure gracefully
  if (!extraction) {
    console.log('[Knowledge] Extraction failed, skipping');
    return {};
  }

  console.log(`[Knowledge] Classified as: ${extraction.contentType}`);

  if (extraction.contentType === 'study_material' && extraction.studyMaterial) {
    // Route to document ingestion pipeline
    const { title, content, subject } = extraction.studyMaterial;

    try {
      const result = await ingestDocument(
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

      console.log(
        `[Knowledge] Ingested study material: "${title}" (${result.chunkCount} chunks)`
      );
    } catch (err) {
      console.error('[Knowledge] Failed to ingest study material:', err);
    }
  } else if (extraction.contentType === 'personal_memory' && extraction.memories) {
    // Route to memory storage (existing logic)
    const validMemories = extraction.memories.filter((mem) => mem.worth_keeping);

    let added = 0;
    let skipped = 0;

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
      if (result) {
        added++;
      } else {
        skipped++;
      }
    }

    if (added > 0 || skipped > 0) {
      console.log(`[Knowledge] Added ${added} memories, skipped ${skipped} duplicates`);
    }
  } else {
    // Ephemeral - nothing to store
    console.log('[Knowledge] Ephemeral content, nothing stored');
  }

  return {};
};
