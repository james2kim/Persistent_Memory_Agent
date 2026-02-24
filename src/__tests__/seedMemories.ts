/**
 * Seed script for memory retrieval evaluation tests.
 *
 * Usage:
 *   npx tsx src/__tests__/seedMemories.ts
 *
 * This creates test memories in the database under a dedicated test user.
 * Run this before running the memory retrieval evaluation tests.
 */

import { db } from '../db/knex';
import { MemoryStore } from '../stores/MemoryStore';
import { defaultEmbedding } from '../services/EmbeddingService';
import { TEST_MEMORIES, TEST_USER_ID } from './fixtures/testMemories';

async function seedTestMemories() {
  console.log('='.repeat(50));
  console.log('Seeding test data for memory retrieval evaluation');
  console.log('='.repeat(50));

  // Clean up existing test data
  console.log(`\nCleaning up existing test data for user: ${TEST_USER_ID}`);
  await db('memories').where('user_id', TEST_USER_ID).delete();
  console.log('Cleanup complete.');

  // Insert each test memory
  console.log(`\nInserting ${TEST_MEMORIES.length} test memories...`);

  const now = Date.now();

  for (const mem of TEST_MEMORIES) {
    console.log(`\n  [${mem.id}] ${mem.type} (confidence: ${mem.confidence})`);
    console.log(`    Content: ${mem.content.slice(0, 60)}...`);
    console.log(`    Days ago: ${mem.daysAgo}`);

    try {
      // Calculate created_at based on daysAgo
      const createdAt = new Date(now - mem.daysAgo * 86400000);

      // Generate embedding for the memory content
      const embedding = await defaultEmbedding.embedText(mem.content, 'document');

      // Insert into database
      await MemoryStore.addMemory(
        {
          content: mem.content,
          type: mem.type,
          confidence: mem.confidence,
          user_id: TEST_USER_ID,
        },
        embedding
      );

      // Update created_at to the calculated time
      await db('memories')
        .where('user_id', TEST_USER_ID)
        .where('content', mem.content)
        .update({ created_at: createdAt });

      console.log(`    ✓ Inserted`);
    } catch (err) {
      console.error(`    ✗ Failed:`, err);
      throw err;
    }
  }

  // Verify insertion
  const memoryCount = await db('memories')
    .where('user_id', TEST_USER_ID)
    .count('* as count')
    .first();

  // Count by type
  const byType = await db('memories')
    .where('user_id', TEST_USER_ID)
    .select('type')
    .count('* as count')
    .groupBy('type');

  console.log('\n' + '='.repeat(50));
  console.log('Seeding complete!');
  console.log(`  Total memories: ${memoryCount?.count}`);
  console.log('  By type:');
  for (const row of byType) {
    console.log(`    ${row.type}: ${row.count}`);
  }
  console.log('='.repeat(50));
}

async function main() {
  try {
    await seedTestMemories();
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
