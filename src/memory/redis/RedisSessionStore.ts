import { createClient, RedisClientType } from "redis";
import  type {SessionState} from '../types';
import crypto from 'crypto';
import {
    MessagesValue,
  } from '@langchain/langgraph';
import { networkInterfaces } from "os";
import { Session } from "inspector";

export class RedisSessionStore {
    private client: RedisClientType;
    private maxMessages: number;
    private ttl: number;
    private keyPrefix: string

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
            updatedAt: new Date().toISOString()
        }
    }

    async writeSession(sessionId: string, state: SessionState) {
        const k = this.key(sessionId)
        const s = {
            ...state,
            messages: state.messages.slice(-this.maxMessages),
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
            updatedAt: initial.updatedAt ?? base.updatedAt
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

    async appendMessage(sessionId: string, message: MessagesValue) {
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