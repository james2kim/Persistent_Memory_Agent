import type { Knex } from 'knex';
import { EmbeddingUtil } from '../util/EmbeddingUtil';

export class DocumentStore {
  constructor(
    private knex: Knex,
    private embedDim: number
  ) {}

  async upsertDocument(
    input: { user_id: string; source: string; title?: string; metadata?: Record<string, unknown> },
    trx?: Knex.Transaction
  ) {
    const k = trx ?? this.knex;

    const rows = await k('documents')
      .insert({
        metadata: input.metadata ?? {},
        title: input.title ?? null,
        source: input.source,
        user_id: input.user_id,
      })
      .onConflict(['user_id', 'source'])
      .merge({
        title: input.title ?? null,
        metadata: input.metadata ?? {},
        updated_at: k.fn.now(),
      })
      .returning(['id']);

    return {
      id: rows[0].id,
    };
  }

  async listChunksBySimilarity(
    input: { topK: number; queryEmbedding: number[]; user_id: string },
    trx?: Knex.Transaction
  ) {
    const k = trx ?? this.knex;

    const chunks = k('chunks')
      .select(['id', 'document_id', 'chunk_index', 'content', 'token_count', 'metadata'])
      .whereNotNull('embedding')
      .andWhere('user_id', '=', input.user_id)
      .orderByRaw('embedding <=> ?::vector', [
        EmbeddingUtil.toPgVectorLiteral(input.queryEmbedding),
      ])
      .limit(input.topK);

    return await chunks;
  }

  async upsertChunks(
    input: {
      user_id: string;
      documentId: string;
      chunks: Array<{
        chunkIndex: number;
        content: string;
        tokenCount: number;
        embedding: number[];
        metadata?: Record<string, unknown>;
      }>;
    },
    trx?: Knex.Transaction
  ): Promise<void> {
    const k = trx ?? this.knex;

    const rows = input.chunks.map((chunk) => ({
      document_id: input.documentId,
      user_id: input.user_id,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      token_count: chunk.tokenCount,
      metadata: chunk.metadata ?? {},
      embedding: k.raw('?::vector', [EmbeddingUtil.toPgVectorLiteral(chunk.embedding)]),
      updated_at: k.fn.now(),
    }));

    await k('chunks')
      .insert(rows)
      .onConflict(['document_id', 'chunk_index'])
      .merge({
        content: k.raw('excluded.content'),
        token_count: k.raw('excluded.token_count'),
        metadata: k.raw('excluded.metadata'),
        embedding: k.raw('excluded.embedding'),
        updated_at: k.fn.now(),
      });
  }
}
