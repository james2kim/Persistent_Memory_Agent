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

export const summarizationSchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string().min(50).max(1200),
});

export const memorySchema = z.object({
  id: z.number().int().positive(),
  user_id: z.string(),
  type: z.enum(['preference', 'goal', 'fact', 'decision', 'summary']),
  confidence: z.number().min(0).max(1),
  content: z.string().min(10).max(200),
  created_at: isoDateString,
  embedding: z.string(),
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
    poolSize: z.number().max(100).default(50),
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
    poolSize: z.number().max(100),
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
      poolSize: z.number().max(100).optional(),
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
