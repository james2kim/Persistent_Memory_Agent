import { createClient } from 'redis';

async function main() {
  const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  await client.connect();

  const keys = await client.keys('*');
  console.log('Keys before:', keys.length);

  if (keys.length > 0) {
    await client.flushDb();
  }

  const after = await client.keys('*');
  console.log('Keys after:', after.length);

  await client.disconnect();
  console.log('Redis cleared.');
}

main().catch(console.error);
