import type { Knex } from 'knex';
import { db } from '../db/knex';
import type { Memory } from '../schemas/types';
import { EmbeddingUtil } from '../util/EmbeddingUtil';

export class MemoryStoreClass {
  constructor(private knex: Knex) {}

  async addMemory(
    memory: {
      content: Memory['content'];
      type: Memory['type'];
      confidence: Memory['confidence'];
      user_id: Memory['user_id'];
    },
    embedding: number[]
  ) {
    const rows = await this.knex('memories')
      .insert({
        content: memory.content,
        confidence: memory.confidence,
        type: memory.type,
        user_id: memory.user_id,
        embedding: this.knex.raw('?::vector', [EmbeddingUtil.toPgVectorLiteral(embedding)]),
      })
      .returning(['id']);

    return rows[0].id;
  }

  /**
   * Fetch profile memories (preferences + facts) by confidence.
   * No embedding needed - these are always relevant for personalization.
   */
  async listProfileMemories({
    user_id,
    limit = 5,
    minConfidence = 0.6,
  }: {
    user_id: string;
    limit?: number;
    minConfidence?: number;
  }): Promise<Memory[]> {
    return await this.knex('memories')
      .select(['id', 'user_id', 'type', 'confidence', 'content', 'created_at'])
      .where('user_id', user_id)
      .whereIn('type', ['preference', 'fact'])
      .andWhere('confidence', '>=', minConfidence)
      .orderBy('confidence', 'desc')
      .limit(limit);
  }

  async listMemoriesBySimilarity({
    user_id,
    topK = 10,
    minConfidence = 0.5,
    allowedTypes,
    embedding,
  }: {
    user_id: string;
    topK?: number;
    minConfidence?: number;
    allowedTypes?: Memory['type'][];
    embedding: number[];
  }) {
    const query = this.knex('memories')
      .select(['*'])
      .where('user_id', user_id)
      .andWhere('confidence', '>=', minConfidence)
      .orderByRaw('embedding <=> ?::vector', [EmbeddingUtil.toPgVectorLiteral(embedding)])
      .limit(topK);

    if (allowedTypes && allowedTypes.length > 0) {
      query.whereIn('type', allowedTypes);
    }
    return await query;
  }
}

export const MemoryStore = new MemoryStoreClass(db);
