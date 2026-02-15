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
