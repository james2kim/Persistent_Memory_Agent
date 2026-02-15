import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (t) => {
    t.string('user_id').notNullable();
    t.index(['user_id'], 'idx_documents_user_id');
  });

  await knex.schema.alterTable('documents', (t) => {
    t.dropUnique(['source']);
    t.unique(['user_id', 'source']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (t) => {
    t.dropUnique(['user_id', 'source']);
    t.unique(['source']);
    t.dropIndex(['user_id'], 'idx_documents_user_id');
    t.dropColumn('user_id');
  });
}
