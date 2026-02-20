import { createClient, RedisClientType } from 'redis';
import type { SessionState } from '../schemas/types';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * RedisSessionStore - Manages session IDs and provides a read view for the UI.
 *
 * Note: The primary state manager is RedisCheckpointer (used by LangGraph).
 * This store is synced by the checkpointer and read by the API for UI display.
 */
export class RedisSessionStoreClass {
  private client: RedisClientType;
  private ttl: number;
  private keyPrefix: string;

  constructor(opts: { redisUrl: string; ttl: number; keyPrefix?: string }) {
    this.client = createClient({ url: opts.redisUrl });
    this.ttl = opts.ttl;
    this.keyPrefix = opts.keyPrefix ?? 'session:';

    this.client.on('error', (err) => {
      console.log('Redis Client Error', err);
    });
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }
  async disconnect() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  private key(sessionId: string) {
    return `${this.keyPrefix}${sessionId}`;
  }

  emptySession(userId: string, sessionId: string) {
    return {
      taskState: {
        attempts: 0,
      },
      messages: [],
      updatedAt: new Date().toISOString(),
      summary: '',
      userId,
      sessionId,
    };
  }

  async writeSession(sessionId: string, state: SessionState) {
    const k = this.key(sessionId);
    const s = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await this.client.set(k, JSON.stringify(s), { EX: this.ttl });
    return s;
  }

  async createSession(userId: string, initial: Partial<SessionState> = {}) {
    const sessionId = crypto.randomUUID();
    const base = this.emptySession(userId, sessionId);

    const state: SessionState = {
      messages: initial.messages ?? base.messages,
      taskState: initial.taskState ?? base.taskState,
      updatedAt: initial.updatedAt ?? base.updatedAt,
      summary: initial.summary ?? base.summary,
      userId,
      sessionId,
    };
    await this.client.set(this.key(sessionId), JSON.stringify(state), { EX: this.ttl });
    return {
      sessionId,
      state,
    };
  }

  async getSession(sessionId: string, userId: string, refreshTtl = true) {
    const k = this.key(sessionId);
    const raw = await this.client.get(k);
    if (!raw) {
      const fresh = this.emptySession(userId, sessionId);
      if (refreshTtl) {
        await this.client.set(k, JSON.stringify(fresh), { EX: this.ttl });
      }
      return { state: fresh, sessionId };
    }
    let parsed: SessionState;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const fresh = this.emptySession(userId, sessionId);
      await this.client.set(k, JSON.stringify(fresh), { EX: this.ttl });
      return { state: fresh, sessionId };
    }
    if (refreshTtl) {
      this.client.expire(k, this.ttl);
    }
    return {
      state: parsed,
      sessionId,
    };
  }

  async getActiveSessionId(userId: string): Promise<string | null> {
    return await this.client.get(`user:${userId}:active_session`);
  }

  async setActiveSessionId(userId: string, sessionId: string): Promise<void> {
    await this.client.set(`user:${userId}:active_session`, sessionId);
  }

  async getOrCreateSession(userId: string): Promise<{ sessionId: string; state: SessionState }> {
    const activeSessionId = await this.getActiveSessionId(userId);

    if (activeSessionId) {
      const exists = await this.client.exists(this.key(activeSessionId));
      if (exists) {
        const { state } = await this.getSession(activeSessionId, userId);
        return { sessionId: activeSessionId, state };
      }
    }

    // Session expired or doesn't exist - create new
    const { sessionId, state } = await this.createSession(userId);
    await this.setActiveSessionId(userId, sessionId);
    return { sessionId, state };
  }
}

export const RedisSessionStore = new RedisSessionStoreClass({
  redisUrl: process.env.REDIS_URL ?? '',
  ttl: 86400,
  keyPrefix: 'session:',
});
