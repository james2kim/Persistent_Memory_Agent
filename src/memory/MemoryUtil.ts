import { SQLMemoryStore } from './sql/SqlMemoryStore';
import {
  type Message,
  type Memory,
  searchMemoriesFailureSchema,
  searchMemoriesSuccessSchema,
} from '../schemas/types';
import { defaultEmbedding } from './EmbeddingService';
import { z } from 'zod/v4';

type SearchMemoriesSuccess = z.infer<typeof searchMemoriesSuccessSchema>;
type SearchMemoriesFailure = z.infer<typeof searchMemoriesFailureSchema>;
type SearchMemoriesResult = SearchMemoriesSuccess | SearchMemoriesFailure;

const MAX_AGE_BY_TYPE = {
  preference: null,
  fact: null,
  summary: 90,
  goal: 90,
  decision: 30,
};

export const MemoryUtil = {
  shouldSummarize(messages: Message[], maxMessages = 40) {
    return messages.length >= maxMessages;
  },
  estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  },
  applyBudget(memories: Memory[], options?: { maxMemories?: number; maxTokens?: number }) {
    const MAX_MEMORIES = options?.maxMemories ?? 5;
    const MAX_TOKENS = options?.maxTokens ?? 800;
    let totalTokens = 0;
    const selected = [];

    for (const mem of memories) {
      const tokens = this.estimateTokens(mem.content);
      if (totalTokens + tokens > MAX_TOKENS) break;
      totalTokens += tokens;
      selected.push(mem);
      if (selected.length >= MAX_MEMORIES) break;
    }
    return selected;
  },
  passRelevanceRules(memory: Memory) {
    if (memory.confidence < 0.6) return false;

    const createdAt = new Date(memory.created_at);
    if (isNaN(createdAt.getTime())) return false;

    const daysSinceCreation = (Date.now() - createdAt.getTime()) / 86400000;

    const maxAge = MAX_AGE_BY_TYPE[memory.type];
    if (maxAge != null && daysSinceCreation > maxAge) return false;

    if (!memory.content?.trim()) return false;

    return true;
  },

  relevanceScore(memory: Memory, taskTypes?: Memory['type'][], queryText?: string) {
    let score = 0;

    if (taskTypes && taskTypes.includes(memory.type)) score += 3;
    if (memory.type === 'fact' || memory.type === 'preference') score += 2;

    score += memory.confidence * 2;

    // Optional Stage A keyword boost (cheap)
    if (queryText) {
      const q = queryText.toLowerCase();
      if (memory.content.toLowerCase().includes(q.slice(0, 12))) score += 1;
    }

    return score;
  },
  cosineSimilarity(a: number[], b: number[]) {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) {
      return 0;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  },
  async listMemoriesBySimilarity({
    userId,
    queryText,
    poolSize = 50,
    topK = 5,
    minConfidence = 0.4,
    allowedTypes,
  }: {
    userId: string;
    queryText: string;
    poolSize?: number;
    topK?: number;
    minConfidence?: number;
    allowedTypes?: Memory['type'][];
  }) {
    const queryEmbedding = await defaultEmbedding.embedText(queryText, 'query');
    const pool = SQLMemoryStore.listMemories({ user_id: userId, limit: poolSize, minConfidence });
    const typeFiltered = allowedTypes ? pool.filter((m) => allowedTypes!.includes(m.type)) : pool;
    const scored = typeFiltered
      .filter((m) => !!m.embedding)
      .map((m) => {
        const emb = JSON.parse(m.embedding as unknown as string) as number[];
        return { mem: m, sim: this.cosineSimilarity(queryEmbedding as number[], emb) };
      })
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK)
      .map((m) => m.mem);

    return scored;
  },

  async retrieveRelevantMemories(
    userId: string,
    queryText: string,
    options: {
      maxResults?: number;
      maxTokens?: number;
      minConfidence?: number;
      allowedTypes?: Memory['type'][];
      poolSize?: number;
    }
  ): Promise<SearchMemoriesResult> {
    const baseFailure = {
      success: false as const,
      queryText,
      user_id: userId,
      options: {
        maxResults: options.maxResults,
        maxTokens: options.maxTokens,
        minConfidence: options.minConfidence,
        allowedTypes: options.allowedTypes,
        poolSize: options.poolSize,
      },
    };

    // Step 1: Get query embedding
    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await defaultEmbedding.embedText(queryText, 'query');
      if (!queryEmbedding) {
        return searchMemoriesFailureSchema.parse({
          ...baseFailure,
          error_type: 'embedding_error',
          error_message: 'Failed to generate embedding for query text',
        });
      }
    } catch (err) {
      return searchMemoriesFailureSchema.parse({
        ...baseFailure,
        error_type: 'embedding_error',
        error_message: err instanceof Error ? err.message : 'Unknown embedding error',
      });
    }

    // Step 2: Query SQL for candidate memories
    let pool: Memory[];
    try {
      pool = SQLMemoryStore.listMemories({
        user_id: userId,
        limit: options?.poolSize ?? 50,
        minConfidence: options?.minConfidence ?? 0.5,
      });
      console.log('pool', pool);
    } catch (err) {
      return searchMemoriesFailureSchema.parse({
        ...baseFailure,
        error_type: 'failed_sql_query',
        error_message: err instanceof Error ? err.message : 'Unknown SQL query error',
      });
    }

    // Step 3: Filter, score, and rank
    try {
      const typeFiltered = options.allowedTypes
        ? pool.filter((m) => options.allowedTypes!.includes(m.type))
        : pool;

      const scored = typeFiltered
        .filter((m) => !!m.embedding)
        .map((m) => {
          const emb = JSON.parse(m.embedding as unknown as string) as number[];
          return { mem: m, sim: this.cosineSimilarity(queryEmbedding, emb) };
        })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, options?.maxResults ?? 10)
        .map((m) => m.mem);

      const memoriesByRelevance = scored.filter((mem) => this.passRelevanceRules(mem));
      const ranked = memoriesByRelevance
        .map((mem) => ({ mem, score: this.relevanceScore(mem, options?.allowedTypes, queryText) }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.mem);

      const results = this.applyBudget(ranked, {
        ...(options.maxResults !== undefined && { maxMemories: options.maxResults }),
        ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
      });

      return searchMemoriesSuccessSchema.parse({
        success: true,
        memories: results,
        queryText,
        user_id: userId,
        options: {
          maxResults: options.maxResults ?? 10,
          maxTokens: options.maxTokens ?? 800,
          minConfidence: options.minConfidence ?? 0.5,
          allowedTypes: options.allowedTypes,
          poolSize: options.poolSize ?? 50,
        },
        count: results.length,
      });
    } catch (err) {
      return searchMemoriesFailureSchema.parse({
        ...baseFailure,
        error_type: 'unknown_runtime_error',
        error_message: err instanceof Error ? err.message : 'Unknown error during memory retrieval',
      });
    }
  },
};
