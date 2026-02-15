import type { Knex } from 'knex';

const EMBED_DIM = 1024; // set to Voyage dim you use

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await knex.schema.createTable('documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('source').notNullable();
    t.text('title');
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['source']);
  });

  await knex.schema.createTable('chunks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('document_id').notNullable().references('id').inTable('documents').onDelete('CASCADE');
    t.integer('chunk_index').notNullable();
    t.text('content').notNullable();
    t.integer('token_count').notNullable().defaultTo(0);
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.specificType('embedding', `vector(${EMBED_DIM})`);
    t.unique(['document_id', 'chunk_index']);
    t.index(['document_id'], 'idx_chunks_document_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chunks');
  await knex.schema.dropTableIfExists('documents');
}
