import { z } from 'zod/v4';
import { StateSchema, MessagesValue } from '@langchain/langgraph';

export const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'Invalid ISO date string',
});

export const memoryExtractionSchema = z.object({
  worth_keeping: z.boolean(),
  type: z.enum(['preference', 'goal', 'fact', 'decision', 'summary']),
  confidence: z.number().min(0).max(1),
  content: z.string().min(10).max(1000),
});

export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;

export const memoryExtractionArraySchema = z.object({
  memories: z.array(memoryExtractionSchema),
});

export type MemoryExtractionArray = z.infer<typeof memoryExtractionArraySchema>;

export const retrievalGateAssessmentSchema = z.object({
  requiresExternalTruth: z.boolean(),
  ambiguity: z.enum(['low', 'moderate', 'high']),
  risk: z.enum(['low', 'moderate', 'high']),
  notes: z.string().min(10).max(200),
});

export type RetrievalGateAssessment = z.infer<typeof retrievalGateAssessmentSchema>;

export const summarizationSchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string().min(50).max(1200),
});

export const memorySchema = z.object({
  id: z.uuid(),
  user_id: z.string(),
  type: z.enum(['preference', 'goal', 'fact', 'decision', 'summary']),
  confidence: z.number().min(0).max(1),
  content: z.string().min(10).max(1000),
  created_at: z.union([isoDateString, z.date()]),
});

export type Memory = z.infer<typeof memorySchema>;

export const MessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: isoDateString,
});

export type Message = z.infer<typeof MessageSchema>;

export const searchMemoriesInputSchema = z.object({
  queryText: z.string(),
  options: z.object({
    maxResults: z.number().max(20).default(5),
    maxTokens: z.number().max(2000),
    minConfidence: z.number().min(0.1).max(1).default(0.5),
    allowedTypes: z.array(z.enum(['preference', 'goal', 'fact', 'decision', 'summary'])).optional(),
  }),
});
export type SearchMemoriesInput = z.infer<typeof searchMemoriesInputSchema>;

export const searchMemoriesSuccessSchema = z.object({
  success: z.literal(true),
  memories: z.array(memorySchema),
  queryText: z.string(),
  user_id: z.string(),
  options: z.object({
    maxResults: z.number().max(20),
    maxTokens: z.number().max(2000),
    minConfidence: z.number().min(0.1).max(1),
    allowedTypes: z.array(z.enum(['preference', 'goal', 'fact', 'decision', 'summary'])).optional(),
  }),
  count: z.number().int().min(0),
});

export const searchMemoriesFailureSchema = z.object({
  success: z.literal(false),
  queryText: z.string(),
  user_id: z.string(),
  options: z
    .object({
      maxResults: z.number().max(20).optional(),
      maxTokens: z.number().max(2000).optional(),
      minConfidence: z.number().min(0).max(1).optional(),
      allowedTypes: z
        .array(z.enum(['preference', 'goal', 'fact', 'decision', 'summary']))
        .optional(),
    })
    .partial(),
  error_type: z.enum([
    'unknown_runtime_error',
    'invalid_input',
    'invalid_schema',
    'failed_sql_query',
    'not_found',
    'embedding_error',
  ]),
  error_message: z.string().min(10).max(500),
});

export const SessionStateSchema = z.object({
  messages: z.array(MessageSchema),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
  response: z.string().optional(),
  taskState: z.object({
    attempts: z.number(),
  }),
  updatedAt: isoDateString,
  summary: z.string().max(1200),
  sessionId: z.string(),
  userId: z.string(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const RedisOptionsSchema = z.object({
  redisUrl: z.string(),
  ttlSeconds: z.number(),
  maxMessages: z.number(),
  keyPrefix: z.string().optional(),
});
export type RedisOptions = z.infer<typeof RedisOptionsSchema>;

export const AgentStateSchema = new StateSchema({
  messages: MessagesValue,
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      })
    )
    .optional(),
  response: z.string().optional(),

  taskState: z.object({
    attempts: z.number(),
  }),
  updatedAt: isoDateString,
  summary: z.string().max(1200),
  userQuery: z.string(),
  sessionId: z.string(),
  userId: z.string(),
});
export type AgentState = typeof AgentStateSchema.State;

export type RawChunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
};

export interface RetrievedChunk extends RawChunk {
  created_at: string;
  embedding: number[];
}

export const IngestDocumentSchema = z.object({
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  title: z.string(),
  text: z.string(),
});

export type IngestDocument = z.infer<typeof IngestDocumentSchema>;

// Search Documents (RAG) schemas
export const searchDocumentsInputSchema = z.object({
  queryText: z.string().describe('The search query to find relevant document chunks'),
  options: z
    .object({
      topK: z.number().min(1).max(20).default(5).describe('Number of chunks to return'),
    })
    .optional(),
});
export type SearchDocumentsInput = z.infer<typeof searchDocumentsInputSchema>;

export const documentChunkSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  chunk_index: z.number(),
  content: z.string(),
  token_count: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type DocumentChunk = z.infer<typeof documentChunkSchema>;

export const searchDocumentsSuccessSchema = z.object({
  success: z.literal(true),
  chunks: z.array(documentChunkSchema),
  queryText: z.string(),
  count: z.number(),
});

export const searchDocumentsFailureSchema = z.object({
  success: z.literal(false),
  queryText: z.string(),
  error_type: z.enum(['embedding_error', 'query_error', 'no_results']),
  error_message: z.string(),
});

// Retrieval Gate Decision Schema
export const retrievalGateDecisionSchema = z.object({
  shouldRetrieveDocuments: z.boolean().describe('Whether to search the document corpus'),
  shouldRetrieveMemories: z.boolean().describe('Whether to search long-term memories'),
  reasoning: z.string().max(200).describe('Brief explanation of the decision'),
});
export type RetrievalGateDecision = z.infer<typeof retrievalGateDecisionSchema>;

// Retrieved Context Schema (stored in agent state)
export const retrievedContextSchema = z.object({
  documents: z.array(documentChunkSchema).default([]),
  memories: z.array(memorySchema).default([]),
  gateDecision: retrievalGateDecisionSchema.optional(),
});
export type RetrievedContext = z.infer<typeof retrievedContextSchema>;

// Knowledge Extraction Schema (for extractAndStoreKnowledge node)
export const studyMaterialExtractionSchema = z.object({
  title: z.string().min(3).max(200).describe('A descriptive title for the study material'),
  content: z.string().min(20).describe('The study content to store'),
  subject: z.string().max(100).optional().describe('Subject area (e.g., Biology, History)'),
});
export type StudyMaterialExtraction = z.infer<typeof studyMaterialExtractionSchema>;

export const knowledgeExtractionSchema = z.object({
  contentType: z
    .enum(['study_material', 'personal_memory', 'ephemeral'])
    .describe(
      'study_material: factual content to learn/reference. personal_memory: user preferences/goals/decisions. ephemeral: conversational, not worth storing.'
    ),
  studyMaterial: studyMaterialExtractionSchema.optional(),
  memories: z.array(memoryExtractionSchema).optional(),
});
export type KnowledgeExtraction = z.infer<typeof knowledgeExtractionSchema>;
