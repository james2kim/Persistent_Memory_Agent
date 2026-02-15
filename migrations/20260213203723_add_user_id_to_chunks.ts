import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chunks', (t) => {
    t.string('user_id').notNullable();
    t.index(['user_id'], 'idx_chunks_user_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chunks', (t) => {
    t.dropIndex(['user_id'], 'idx_chunks_user_id');
    t.dropColumn('user_id');
  });
}
