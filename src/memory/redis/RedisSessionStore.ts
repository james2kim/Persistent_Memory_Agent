import { createClient, RedisClientType } from "redis";
import type { SessionState, Message } from '../types';
import crypto from 'crypto';
import { SummarizeUil } from "../SummarizeUtil";
import { summarizeMessages } from "../summarizeMessages";

export class RedisSessionStore {
    private client: RedisClientType;
    private maxMessages: number;
    private ttl: number;
    private keyPrefix: string
    private summary: string | undefined
    constructor(opts: {
        redisUrl: string,
        maxMessages: number,
        ttl: number,
        keyPrefix: string

    }) {
        this.client = createClient({url: opts.redisUrl})
        this.maxMessages = opts.maxMessages
        this.ttl = opts.ttl
        this.keyPrefix = opts.keyPrefix ?? 'session:'
        this.summary = ''

        this.client.on('error', (err: any) => {
            console.log('Redis Client Error', err)
        })
    }

    async connect() {
        if(!this.client.isOpen) {
            await this.client.connect()
        }
    }
    async disconnect() {
        if(this.client.isOpen) {
            await this.client.quit()
        }
    }

    private key(sessionId: string) {
        return `${this.keyPrefix}${sessionId}`
    }

    emptySession() {
        return {
            taskState: {},
            taskCache: {},
            messages: [],
            updatedAt: new Date().toISOString(),
            summary: ''
        }
    }

    async writeSession(sessionId: string, state: SessionState) {
        const k = this.key(sessionId)
        let result;
        const s = {
            ...state,
            updatedAt: new Date().toISOString()
        }
        await this.client.set(k, JSON.stringify(s), {EX: this.ttl})
        return s
    }

    async createSession(initial: Partial<SessionState>) {
        const sessionId = crypto.randomUUID()
        const base = this.emptySession()

        const state = {
            messages: initial.messages ?? base.messages,
            taskState: initial.taskState ?? base.taskState,
            taskCache: initial.taskCache ?? base.taskCache,
            updatedAt: initial.updatedAt ?? base.updatedAt,
            summary: initial.summary ?? base.summary
        }
        await this.client.set(this.key(sessionId), JSON.stringify(state), {EX: this.ttl})
        return {
            sessionId,
            state
        }
    }

    async getSession(sessionId: string, refreshTtl = true) {
        const k = this.key(sessionId)
        const raw = await this.client.get(k)
        if(!raw) {
            const fresh = this.emptySession()
            if(refreshTtl) {
                await this.client.set(k, JSON.stringify(fresh), {EX: this.ttl})
            }
            return fresh
        }
        let parsed: SessionState
        try {
            parsed = JSON.parse(raw)
        } catch {

            const fresh = this.emptySession()
            await this.client.set(k, JSON.stringify(fresh), {EX: this.ttl})
            return fresh
        }
        if(refreshTtl) {
            this.client.expire(k, this.ttl)
        }
        return parsed
    }

    async appendMessage(sessionId: string, message: Message) {
        const state = await this.getSession(sessionId)
        const newState = {
            ...state,
            messages: [...state.messages, message],
            updatedAt: new Date().toISOString()
        }
        await this.writeSession(sessionId, newState)
        return newState
    }

    async getTtl(sessionId: string) {
        return await this.client.ttl(this.key(sessionId))
    }

}