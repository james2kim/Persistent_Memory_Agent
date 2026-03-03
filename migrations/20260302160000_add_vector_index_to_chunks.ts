import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // HNSW index on the embedding column for fast approximate nearest-neighbor search.
  // - vector_cosine_ops: matches the <=> (cosine distance) operator used in queries.
  // - m = 16: max connections per node (default). Good recall/memory tradeoff.
  // - ef_construction = 64: build-time candidate list size (default). Higher = better
  //   recall but slower index build.
  await knex.raw(`
    CREATE INDEX idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_chunks_embedding_hnsw');
}
