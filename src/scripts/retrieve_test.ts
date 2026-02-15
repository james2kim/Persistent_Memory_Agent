import { db } from '../db/knex';
import { DocumentStore } from '../stores/DocumentStore';
import { defaultEmbedding } from '../services/EmbeddingService';

const EMBED_DIM = 1024;

async function main() {
  const user_id = 'user_test_1';
  const queryText = 'What does <=> mean in pgvector?';

  const stores = {
    documents: new DocumentStore(db, EMBED_DIM),
  };

  const queryEmbedding = await defaultEmbedding.embedText(queryText, 'query');

  const chunks = await stores.documents.listChunksBySimilarity({
    user_id,
    topK: 5,
    queryEmbedding,
  });

  console.log(`Query: ${queryText}`);
  console.log('Top chunks:');
  for (const c of chunks) {
    console.log('----');
    console.log(`doc=${c.document_id} idx=${c.chunk_index}`);
    console.log(c.content);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
