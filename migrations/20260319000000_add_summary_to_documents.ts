import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (t) => {
    t.text('summary').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (t) => {
    t.dropColumn('summary');
  });
}
