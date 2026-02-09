import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Memory } from '../../schemas/types';
import { defaultEmbedding } from '../EmbeddingService';
import { MemoryUtil } from '../MemoryUtil';

const SIMILARITY_THRESHOLD = 0.9;

export class SQLMemoryStoreClass {
  private db: Database.Database;

  constructor(dbPath = 'memory.sqlite') {
    this.db = new Database(dbPath);
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);
  }

  private findSimilar(
    userId: string,
    embedding: number[],
    type: Memory['type'],
    threshold = SIMILARITY_THRESHOLD
  ): Memory | null {
    const candidates = this.db
      .prepare(
        `SELECT * FROM memories WHERE user_id = @userId AND type = @type ORDER BY created_at DESC LIMIT 50`
      )
      .all({ userId, type }) as Memory[];

    for (const mem of candidates) {
      const memEmbedding = JSON.parse(mem.embedding as unknown as string) as number[];
      const similarity = MemoryUtil.cosineSimilarity(embedding, memEmbedding);
      if (similarity >= threshold) {
        return mem;
      }
    }
    return null;
  }

  async addMemory(memory: Partial<Memory>): Promise<Memory | null> {
    const embedding = await defaultEmbedding.embedText(memory.content ?? '', 'document');

    // Check for duplicates
    const existing = this.findSimilar(
      memory.user_id!,
      embedding as number[],
      memory.type!,
      SIMILARITY_THRESHOLD
    );

    if (existing) {
      console.log(`[Dedupe] Skipping similar memory: "${memory.content?.slice(0, 50)}..."`);
      return null;
    }

    const newMemory = {
      ...memory,
      embedding: JSON.stringify(embedding),
    };
    const statement = this.db.prepare(`
            INSERT INTO memories (user_id, type, confidence, content, created_at, embedding)
            VALUES (@user_id, @type, @confidence, @content,  COALESCE(@created_at, datetime('now')), @embedding)
        `);
    const info = statement.run(newMemory);
    return this.db
      .prepare(`SELECT * from memories WHERE id = ?`)
      .get(info.lastInsertRowid) as Memory;
  }

  listMemories({
    user_id,
    limit = 20,
    minConfidence,
  }: {
    user_id: Memory['user_id'];
    limit: number;
    minConfidence: number;
  }) {
    return this.db
      .prepare(
        `
        SELECT * from memories
        WHERE user_id = @user_id AND confidence >= @minConfidence
        ORDER BY datetime(created_at) DESC
        LIMIT @limit
        `
      )
      .all({ user_id, limit, minConfidence }) as Memory[];
  }
  listByType({
    user_id,
    limit = 5,
    type,
  }: {
    user_id: Memory['user_id'];
    type: Memory['type'];
    limit: number;
  }) {
    return this.db
      .prepare(
        `
        SELECT * from memories
        WHERE user_id=@user_id AND type=@type
        ORDER BY datetime(created_at) DESC
        LIMIT=@limit
        `
      )
      .all({ user_id, limit, type }) as Memory[];
  }
  deleteMemory({ id, user_id }: { id: Memory['id']; user_id: Memory['user_id'] }) {
    return this.db
      .prepare(
        `
        DELETE from memories
        WHERE user_id=@user_id AND id=@id
        `
      )
      .run({ user_id, id });
  }
}

export const SQLMemoryStore = new SQLMemoryStoreClass();
