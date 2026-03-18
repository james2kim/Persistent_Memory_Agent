import type { ConnectionOptions } from 'bullmq';

/**
 * Builds a BullMQ ConnectionOptions config from REDIS_URL.
 * BullMQ creates its own ioredis connections internally.
 */
export function getConnectionConfig(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('Missing required environment variable: REDIS_URL');
  }

  const parsed = new URL(url);
  const useTls = parsed.protocol === 'rediss:';

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
  };
}
