import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chunks', (t) => {
    t.integer('start_year').nullable();
    t.integer('end_year').nullable(); // null = "Present" / ongoing
    t.index(['start_year', 'end_year'], 'idx_chunks_temporal');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chunks', (t) => {
    t.dropIndex(['start_year', 'end_year'], 'idx_chunks_temporal');
    t.dropColumn('start_year');
    t.dropColumn('end_year');
  });
}
