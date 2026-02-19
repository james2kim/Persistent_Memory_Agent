import { MemoryStore } from '../stores/MemoryStore';
import {
  type Message,
  type Memory,
  type RawChunk,
  searchMemoriesFailureSchema,
  searchMemoriesSuccessSchema,
} from '../schemas/types';
import { defaultEmbedding } from '../services/EmbeddingService';
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
  chunkText(
    text: string,
    opts?: { maxTokensPerChunk?: number; overlapTokens?: number; maxChunks?: number }
  ): RawChunk[] {
    const MAX_TOKENS = opts?.maxTokensPerChunk ?? 1000;
    const OVERLAP_TOKENS = opts?.overlapTokens ?? 150;
    const MAX_CHUNKS = opts?.maxChunks ?? 10_000;

    const estTokens = (s: string) => this.estimateTokens(s);
    const overlapChars = OVERLAP_TOKENS * 4;
    const maxCharsPerChunk = MAX_TOKENS * 4;

    const out: RawChunk[] = [];
    let chunkIndex = 0;

    const pushChunk = (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      out.push({
        chunk_index: chunkIndex++,
        content: trimmed,
        token_count: estTokens(trimmed),
      });
    };

    // fast path
    if (estTokens(text) <= MAX_TOKENS) {
      pushChunk(text);
      return out;
    }

    const paragraphs = text.split(/\n\n+/);
    let current = '';

    for (const p of paragraphs) {
      const paragraph = p.trim();
      if (!paragraph) continue;

      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

      if (estTokens(candidate) <= MAX_TOKENS) {
        current = candidate;
        continue;
      }

      // current is full; flush it (with overlap)
      if (current.trim()) {
        const flushed = current;
        pushChunk(flushed);
        if (out.length >= MAX_CHUNKS) break;

        // seed overlap
        current = flushed.slice(Math.max(0, flushed.length - overlapChars)).trim();
      }

      // paragraph itself might still be too big => split
      if (estTokens(paragraph) > MAX_TOKENS) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          const sentence = s.trim();
          if (!sentence) continue;

          const cand2 = current ? `${current} ${sentence}` : sentence;

          if (estTokens(cand2) <= MAX_TOKENS) {
            current = cand2;
            continue;
          }

          // flush current
          if (current.trim()) {
            const flushed2 = current;
            pushChunk(flushed2);
            if (out.length >= MAX_CHUNKS) break;
            current = flushed2.slice(Math.max(0, flushed2.length - overlapChars)).trim();
          }

          // sentence too big => force split by chars
          if (estTokens(sentence) > MAX_TOKENS) {
            for (let i = 0; i < sentence.length; i += maxCharsPerChunk) {
              pushChunk(sentence.slice(i, i + maxCharsPerChunk));
              if (out.length >= MAX_CHUNKS) break;
            }
            current = '';
          } else {
            current = sentence;
          }

          if (out.length >= MAX_CHUNKS) break;
        }
      } else {
        current = paragraph;
      }

      if (out.length >= MAX_CHUNKS) break;
    }

    if (current.trim() && out.length < MAX_CHUNKS) pushChunk(current);

    return out;
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
  async retrieveRelevantMemories(
    userId: string,
    queryText: string,
    options: {
      maxResults?: number;
      maxTokens?: number;
      minConfidence?: number;
      allowedTypes?: Memory['type'][];
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

    // Step 3: Filter, score, and rank
    try {
      const scored = await MemoryStore.listMemoriesBySimilarity({
        user_id: userId,
        allowedTypes: options.allowedTypes,
        minConfidence: options.minConfidence,
        embedding: queryEmbedding as number[],
        topK: options.maxResults,
      });

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
        },
        count: results.length,
      });
    } catch (err) {
      return searchMemoriesFailureSchema.parse({
        ...baseFailure,
        error_type: 'failed_sql_query',
        error_message: err instanceof Error ? err.message : 'Unknown SQL query error',
      });
    }
  },
};
