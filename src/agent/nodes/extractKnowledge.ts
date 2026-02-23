import type { AgentState } from '../../schemas/types';
import { extractKnowledge } from '../../llm/extractKnowledge';
import { MemoryStore } from '../../stores/MemoryStore';
import { DocumentStore } from '../../stores/DocumentStore';
import { getUserId } from '../../config';
import { defaultEmbedding } from '../../services/EmbeddingService';
import { ingestDocument } from '../../ingest/ingestDocument';
import { db } from '../../db/knex';
import { TraceUtil } from '../../util/TraceUtil';

const documentStore = new DocumentStore(db, 1024);

export const extractAndStoreKnowledge = async (state: AgentState) => {
  const span = TraceUtil.startSpan('extractAndStoreKnowledge');
  let trace = state.trace!;

  const userId = getUserId();

  // Classify and extract knowledge from user query
  const extraction = await extractKnowledge(state.userQuery);

  let contentType = 'none';
  let memoriesAdded = 0;
  let memoriesSkipped = 0;
  let studyMaterialIngested = false;

  if (extraction) {
    contentType = extraction.contentType;

    if (extraction.contentType === 'study_material' && extraction.studyMaterial) {
      const { title, content, subject } = extraction.studyMaterial;

      try {
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
        studyMaterialIngested = true;
      } catch {
        // Silently handle ingestion failure
      }
    } else if (extraction.contentType === 'personal_memory' && extraction.memories) {
      const validMemories = extraction.memories.filter((mem) => mem.worth_keeping);

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
          memoriesAdded++;
        } else {
          memoriesSkipped++;
        }
      }
    }
  }

  trace = span.end(trace, {
    contentType,
    memoriesAdded,
    memoriesSkipped,
    studyMaterialIngested,
  });

  // Set final outcome - this is the last node in the success path
  trace = TraceUtil.setOutcome(trace, {
    status: 'success',
  });

  // Prune trace at the end of the workflow to prevent bloat
  trace = TraceUtil.pruneTrace(trace);

  return { trace };
};
