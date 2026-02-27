import { db } from '../src/db/knex.js';
import { getUserId } from '../src/config.js';

async function main() {
  const userId = getUserId();
  const memories = await db('memories')
    .where('user_id', userId)
    .select('type', 'content', 'confidence');

  console.log('User ID:', userId);
  console.log('Total memories:', memories.length);
  console.log('\nMemories:');
  memories.forEach((m, i) => {
    console.log(`${i + 1}. [${m.type}] (conf: ${m.confidence}) ${m.content.slice(0, 80)}...`);
  });

  await db.destroy();
}

main().catch(console.error);
