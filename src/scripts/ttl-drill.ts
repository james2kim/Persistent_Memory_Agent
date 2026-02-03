import crypto from "crypto";
import { RedisSessionStore } from "../memory/redis/RedisSessionStore"; // <-- adjust path/class name

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const store = new RedisSessionStore({
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    ttl: 10, // small on purpose for the drill
    maxMessages: 50,
    keyPrefix: "session:",
  });

  await store.connect();

  // 1) Create/write session (TTL should be set)
  const { sessionId } = await store.createSession({
    messages: [],
    taskState: {},
    toolCache: {},
  });

  const ttl1 = await store.getTtl(sessionId);
  console.log("TTL after createSession:", ttl1);
  assert(ttl1 > 0, `expected TTL > 0 after createSession, got ${ttl1}`);

  // 2) Prove TTL counts down
  await sleep(3000);
  const ttl2 = await store.getTtl(sessionId);
  console.log("TTL after 3s:", ttl2);
  assert(ttl2 > 0, `expected TTL > 0 after 3s, got ${ttl2}`);
  assert(ttl2 < ttl1, `expected TTL to decrease (ttl2 < ttl1). ttl1=${ttl1}, ttl2=${ttl2}`);

  // 3) Refresh TTL on activity (append message triggers write + TTL refresh)
  await store.appendMessage(sessionId, {
    id: crypto.randomUUID(),
    role: "user",
    content: "refresh ttl",
    createdAt: new Date().toISOString(),
  });

  const ttl3 = await store.getTtl(sessionId);
  console.log("TTL after append refresh:", ttl3);
  assert(ttl3 > ttl2, `expected TTL to refresh upward. ttl2=${ttl2}, ttl3=${ttl3}`);

  // 4) Let it expire (no activity)
  console.log("Waiting 12s (should expire)...");
  await sleep(12000);

  const ttl4 = await store.getTtl(sessionId);
  console.log("TTL after waiting past expiry:", ttl4);

  // TTL semantics:
  // -2 means key does not exist (expired)
  // -1 means exists but no TTL (bug)
  assert(ttl4 === -2, `expected TTL === -2 after expiry, got ${ttl4}`);

  console.log("✅ Drill 2.1 passed.");

  await store.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});