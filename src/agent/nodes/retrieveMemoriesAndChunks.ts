import type { AgentState, DocumentChunk, Memory } from '../../schemas/types';
import { MemoryUtil } from '../../util/MemoryUtil';
import { DocumentUtil } from '../../util/DocumentUtil';
import { DocumentStore } from '../../stores/DocumentStore';
import { defaultEmbedding } from '../../services/EmbeddingService';
import { db } from '../../db/knex';
import { getUserId } from '../../config';

const documentStore = new DocumentStore(db, 1024);

export const retrieveMemoriesAndChunks = async (state: AgentState) => {
  const decision = state.gateDecision;
  const query = state.userQuery;
  const userId = getUserId();

  const documents: DocumentChunk[] = [];
  const memories: Memory[] = [];

  // Retrieve memories if needed
  if (decision?.shouldRetrieveMemories) {
    const result = await MemoryUtil.retrieveRelevantMemories(userId, query, {
      maxResults: 10,
      maxTokens: 800,
      minConfidence: 0.5,
    });

    if (result.success) {
      memories.push(...result.memories);
    } else {
      console.log('[retrieveMemoriesAndChunks] Memory retrieval failed:', result.error_message);
    }
  }

  // Retrieve document chunks if needed
  if (decision?.shouldRetrieveDocuments) {
    console.log('[retrieveMemoriesAndChunks] Retrieving documents...');
    try {
      const queryEmbedding = await defaultEmbedding.embedText(query, 'query');

      if (queryEmbedding) {
        const chunks = await DocumentUtil.retrieveRelevantChunks(
          documentStore,
          {
            queryEmbedding,
            user_id: userId,
            topK: 30,
          },
          {
            maxPerDoc: 4,
            maxChunks: 8,
          }
        );
        documents.push(...chunks);
      } else {
        console.log('[retrieveMemoriesAndChunks] Failed to generate query embedding');
      }
    } catch (err) {
      console.error('[retrieveMemoriesAndChunks] Document retrieval error:', err);
    }
  }

  return {
    retrievedContext: {
      documents,
      memories,
    },
  };
};
