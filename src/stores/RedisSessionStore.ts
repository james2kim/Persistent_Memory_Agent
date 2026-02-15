import { createClient, RedisClientType } from 'redis';
import type { SessionState, Message } from '../schemas/types';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export class RedisSessionStoreClass {
  private client: RedisClientType;
  private maxMessages: number;
  private ttl: number;
  private keyPrefix: string;
  private summary: string | undefined;
  constructor(opts: { redisUrl: string; maxMessages: number; ttl: number; keyPrefix: string }) {
    this.client = createClient({ url: opts.redisUrl });
    this.maxMessages = opts.maxMessages;
    this.ttl = opts.ttl;
    this.keyPrefix = opts.keyPrefix ?? 'session:';
    this.summary = '';

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

  async appendMessage(sessionId: string, userId: string, message: Message) {
    const { state } = await this.getSession(sessionId, userId);
    const newState = {
      ...state,
      messages: [...state.messages, message],
      updatedAt: new Date().toISOString(),
    };
    await this.writeSession(sessionId, newState);
    return newState;
  }

  async getTtl(sessionId: string) {
    return await this.client.ttl(this.key(sessionId));
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
  maxMessages: 50,
  ttl: 3600,
  keyPrefix: 'session:',
});
