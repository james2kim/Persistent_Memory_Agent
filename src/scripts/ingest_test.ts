import { db } from '../db/knex';
import { DocumentStore } from '../stores/DocumentStore';
import { ingestDocument } from '../ingest/ingestDocument';

const EMBED_DIM = 1024; // match your pgvector dim

async function main() {
  const user_id = 'user_test_1';

  const stores = {
    documents: new DocumentStore(db, EMBED_DIM),
  };

  const input = {
    source: 'test://doc1',
    title: 'Test Doc 1',
    metadata: { kind: 'test' },
    text: `
pgvector provides vector similarity search in Postgres.
The <=> operator computes cosine distance.
Chunks are small pieces of documents that get embeddings.
Documents are metadata; chunks are the searchable units.
Knex migrations allow you to version your schema changes.
`.trim(),
  };

  const res = await ingestDocument(db, stores, input, user_id);
  console.log('Ingest result:', res);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
