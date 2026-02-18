import { tool } from 'langchain';
import {
  searchMemoriesInputSchema,
  searchDocumentsInputSchema,
  searchDocumentsSuccessSchema,
  searchDocumentsFailureSchema,
} from '../schemas/types';
import type { SearchMemoriesInput, SearchDocumentsInput } from '../schemas/types';
import { MemoryUtil } from '../util/MemoryUtil';
import { getUserId } from '../config';
import { DocumentStore } from '../stores/DocumentStore';
import { defaultEmbedding } from '../services/EmbeddingService';
import { db } from '../db/knex';

// Initialize document store for RAG
const documentStore = new DocumentStore(db, 1024);

export const searchMemoriesTool = tool(
  async (input: SearchMemoriesInput) => {
    console.log('searchMemoriesTool called:', input);
    const { queryText, options } = input;
    const user_id = getUserId();
    const result = await MemoryUtil.retrieveRelevantMemories(user_id, queryText, options);
    console.log('searchMemoriesTool result:', result);
    return result;
  },
  {
    name: 'searchMemoriesTool',
    description:
      'Search long-term memories (preferences, facts, goals, decisions). Use for recalling user preferences or past decisions.',
    schema: searchMemoriesInputSchema,
  }
);

export const searchDocumentsTool = tool(
  async (input: SearchDocumentsInput) => {
    console.log('searchDocumentsTool called:', input);
    const { queryText } = input;
    const user_id = getUserId();
    const topK = 30;

    try {
      // Get query embedding
      const queryEmbedding = await defaultEmbedding.embedText(queryText, 'query');
      if (!queryEmbedding) {
        return searchDocumentsFailureSchema.parse({
          success: false,
          queryText,
          error_type: 'embedding_error',
          error_message: 'Failed to generate embedding for query',
        });
      }

      // Search for similar chunks
      const chunks = await documentStore.listChunksBySimilarity({
        queryEmbedding,
        user_id,
        topK,
      });

      if (chunks.length === 0) {
        return searchDocumentsFailureSchema.parse({
          success: false,
          queryText,
          error_type: 'no_results',
          error_message: 'No relevant documents found for the query',
        });
      }

      const result = searchDocumentsSuccessSchema.parse({
        success: true,
        chunks: chunks.map((c) => ({
          id: c.id,
          document_id: c.document_id,
          chunk_index: c.chunk_index,
          content: c.content,
          token_count: c.token_count,
          metadata: c.metadata,
        })),
        queryText,
        count: chunks.length,
      });

      console.log('searchDocumentsTool result: found', result.count, 'chunks');
      return result;
    } catch (err) {
      console.error('searchDocumentsTool error:', err);
      return searchDocumentsFailureSchema.parse({
        success: false,
        queryText,
        error_type: 'query_error',
        error_message: err instanceof Error ? err.message : 'Unknown error searching documents',
      });
    }
  },
  {
    name: 'searchDocumentsTool',
    description:
      'Search uploaded documents (PDFs, Word docs, text files) for relevant content. Use this to find information from the document corpus.',
    schema: searchDocumentsInputSchema,
  }
);

export const TOOLS_BY_NAME = {
  searchMemoriesTool,
  searchDocumentsTool,
};

export const TOOLS_INPUT_SCHEMAS = {
  searchMemoriesTool: searchMemoriesInputSchema,
  searchDocumentsTool: searchDocumentsInputSchema,
};
