import type { AgentState, DocumentChunk, Memory } from '../../schemas/types';
import { MemoryUtil } from '../../util/MemoryUtil';
import { DocumentUtil } from '../../util/DocumentUtil';
import { DocumentStore } from '../../stores/DocumentStore';
import { db } from '../../db/knex';
import { getUserId } from '../../config';

const documentStore = new DocumentStore(db, 1024);

export const retrieveMemoriesAndChunks = async (state: AgentState) => {
  const decision = state.gateDecision;
  const query = state.userQuery;
  const userId = getUserId();
  const queryEmbedding = state.queryEmbedding; // Pre-computed in retrievalGate

  if (!queryEmbedding) {
    console.log('[retrieveMemoriesAndChunks] No embedding available, skipping retrieval');
    return {
      retrievedContext: { documents: [], memories: [] },
    };
  }

  // Build retrieval promises based on what's needed
  const retrievalTasks: Promise<void>[] = [];
  const documents: DocumentChunk[] = [];
  const memories: Memory[] = [];

  // Memory retrieval task
  if (decision?.shouldRetrieveMemories) {
    retrievalTasks.push(
      MemoryUtil.retrieveRelevantMemories(userId, query, {
        maxResults: 10,
        maxTokens: 800,
        minConfidence: 0.5,
        queryEmbedding, // Use pre-computed embedding
      }).then((result) => {
        if (result.success) {
          memories.push(...result.memories);
        } else {
          console.log('[retrieveMemoriesAndChunks] Memory retrieval failed:', result.error_message);
        }
      })
    );
  }

  // Document retrieval task
  if (decision?.shouldRetrieveDocuments) {
    retrievalTasks.push(
      DocumentUtil.retrieveRelevantChunks(
        documentStore,
        {
          queryEmbedding, // Use pre-computed embedding
          user_id: userId,
          topK: 30,
        },
        {
          maxPerDoc: 4,
          maxChunks: 8,
        }
      )
        .then((chunks) => {
          documents.push(...chunks);
        })
        .catch((err) => {
          console.error('[retrieveMemoriesAndChunks] Document retrieval error:', err);
        })
    );
  }

  // Run all retrieval tasks in parallel
  await Promise.all(retrievalTasks);

  return {
    retrievedContext: {
      documents,
      memories,
    },
  };
};
