
import { z } from 'zod/v4';
import {
    MessagesValue,
  } from '@langchain/langgraph';

export const memoryExtractionSchema = z.object({
    worth_keeping: z.boolean(),
    type: z.enum(['preference', 'goal', 'fact', 'decision', 'summary']),
    confidence: z.number().min(0).max(1),
    content: z.string().min(10).max(50),
})

export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;

export const memorySchema = z.object({
    id: z.number().int().positive(),
    user_id: z.string().uuid(),
    type: z.enum(['preference', 'goal', 'fact', 'decision', 'summary']),
    confidence: z.number().min(0).max(1),
    content: z.string().min(10).max(50),
    created_at: z.string()
})

export type Memory = z.infer<typeof memorySchema>

export const SessionStateSchema = z.object({
    messages: MessagesValue,
    taskState: z.object(z.unknown()),
    taskCache: z.object(z.unknown()),
    updatedAt: z.string(),
})

export type SessionState = z.infer<typeof SessionStateSchema>

export const RedisOptionsSchema = z.object({
    redisUrl: z.string(),
    ttlSeconds: z.number(),
    maxMessages: z.number(),
    keyPrefix: z.string().optional(),
})
export type RedisOptions = z.infer<typeof RedisOptionsSchema>
