/**
 * Seed script for retrieval evaluation tests.
 *
 * Usage:
 *   npx tsx src/__tests__/seed.ts
 *
 * This ingests the test documents into the database under a dedicated test user.
 * Run this before running the retrieval evaluation tests.
 */

import { db } from '../db/knex';
import { DocumentStore } from '../stores/DocumentStore';
import { ingestDocument } from '../ingest/ingestDocument';
import { TEST_DOCUMENTS, TEST_USER_ID } from './fixtures/testDocuments';

async function seedTestData() {
  console.log('='.repeat(50));
  console.log('Seeding test data for retrieval evaluation');
  console.log('='.repeat(50));

  const documentStore = new DocumentStore(db, 1024);

  // Clean up existing test data
  console.log(`\nCleaning up existing test data for user: ${TEST_USER_ID}`);
  await db('chunks').where('user_id', TEST_USER_ID).delete();
  await db('documents').where('user_id', TEST_USER_ID).delete();
  console.log('Cleanup complete.');

  // Ingest each test document
  console.log(`\nIngesting ${TEST_DOCUMENTS.length} test documents...`);

  for (const doc of TEST_DOCUMENTS) {
    console.log(`\n  [${doc.id}] ${doc.title}`);
    console.log(`    Source: ${doc.source}`);
    console.log(`    Content length: ${doc.content.length} chars`);

    try {
      const result = await ingestDocument(
        db,
        { documents: documentStore },
        {
          source: doc.source,
          title: doc.title,
          text: doc.content,
          metadata: { testDocId: doc.id },
        },
        TEST_USER_ID
      );

      console.log(`    ✓ Ingested: ${result.chunkCount} chunks`);
    } catch (err) {
      console.error(`    ✗ Failed:`, err);
      throw err;
    }
  }

  // Verify ingestion
  const chunkCount = await db('chunks').where('user_id', TEST_USER_ID).count('* as count').first();
  const docCount = await db('documents').where('user_id', TEST_USER_ID).count('* as count').first();

  console.log('\n' + '='.repeat(50));
  console.log('Seeding complete!');
  console.log(`  Documents: ${docCount?.count}`);
  console.log(`  Chunks: ${chunkCount?.count}`);
  console.log('='.repeat(50));
}

async function main() {
  try {
    await seedTestData();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run when executed directly
main();
