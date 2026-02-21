import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add tsvector column for full-text search
  await knex.schema.alterTable('chunks', (t) => {
    t.specificType('search_vector', 'tsvector').nullable();
  });

  // Create GIN index for fast full-text search
  await knex.raw(`
    CREATE INDEX idx_chunks_search_vector
    ON chunks USING GIN (search_vector)
  `);

  // Populate search_vector for existing rows
  await knex.raw(`
    UPDATE chunks
    SET search_vector = to_tsvector('english', content)
    WHERE search_vector IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_chunks_search_vector');
  await knex.schema.alterTable('chunks', (t) => {
    t.dropColumn('search_vector');
  });
}
