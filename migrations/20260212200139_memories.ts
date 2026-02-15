import type { Knex } from 'knex';

const EMBED_DIM = 1024;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS vector`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await knex.schema.createTable('memories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('user_id').notNullable();
    t.enum('type', ['preference', 'goal', 'fact', 'decision', 'summary'], {
      useNative: true,
      enumName: 'memory_type_enum',
    }).notNullable();
    t.text('content').notNullable();
    t.float('confidence').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.specificType('embedding', `vector(${EMBED_DIM})`);
    t.index(['user_id', 'created_at'], 'idx_memories_user_created');
    t.index(['user_id', 'type'], 'idx_memories_user_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('memories');
}
