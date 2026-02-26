/**
 * Seed script for evaluation suite.
 *
 * Usage:
 *   npx tsx src/evals/seed.ts
 *
 * This ingests the eval fixture documents into the database.
 * Run this before running the evaluation tests.
 *
 * The fixtures contain fake data that matches the expected
 * assertions in the eval dataset (src/evals/dataset.ts).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../db/knex';
import { DocumentStore } from '../stores/DocumentStore';
import { ingestDocument } from '../ingest/ingestDocument';
import { EVAL_DOCUMENTS, EVAL_USER_ID } from './fixtures/evalDocuments';

async function seedEvalData() {
  console.log('='.repeat(50));
  console.log('Seeding eval fixture data');
  console.log('='.repeat(50));

  const documentStore = new DocumentStore(db, 1024);

  // Clean up existing eval data
  console.log(`\nCleaning up existing data for user: ${EVAL_USER_ID}`);
  await db('chunks').where('user_id', EVAL_USER_ID).delete();
  await db('documents').where('user_id', EVAL_USER_ID).delete();
  console.log('Cleanup complete.');

  // Ingest each eval document
  console.log(`\nIngesting ${EVAL_DOCUMENTS.length} eval documents...`);

  for (const doc of EVAL_DOCUMENTS) {
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
          metadata: { evalDocId: doc.id },
        },
        EVAL_USER_ID
      );

      console.log(`    ✓ Ingested: ${result.chunkCount} chunks`);
    } catch (err) {
      console.error(`    ✗ Failed:`, err);
      throw err;
    }
  }

  // Verify ingestion
  const chunkCount = await db('chunks').where('user_id', EVAL_USER_ID).count('* as count').first();
  const docCount = await db('documents').where('user_id', EVAL_USER_ID).count('* as count').first();

  console.log('\n' + '='.repeat(50));
  console.log('Seeding complete!');
  console.log(`  Documents: ${docCount?.count}`);
  console.log(`  Chunks: ${chunkCount?.count}`);
  console.log('='.repeat(50));
  console.log('\nYou can now run evals with: npx tsx src/evals/runLocal.ts');
}

async function main() {
  try {
    await seedEvalData();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
