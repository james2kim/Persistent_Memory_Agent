import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {Memory} from './types';

export class SQLMemoryStore {
    private db: Database.Database

    constructor(dbPath = "memory.sqlite") {
        this.db = new Database(dbPath)
        const schemaPath = path.join(process.cwd(), 'schema.sql')
        const schema = fs.readFileSync(schemaPath, 'utf8')
        this.db.exec(schema)
    }

    addMemory(memory: Memory) {
        const statement = this.db.prepare(`
            INSERT INTO memories (user_id, type, confidence, content, created_at)
            VALUES (@user_id, @type, @confidence, @content,  COALESCE(@created_at, datetime('now')))
        `)
       const info = statement.run(memory)
       return this.db.prepare(`SELECT * from memories WHERE id = ?`).get(info.lastInsertRowid) as Memory
    }

    listMemory({user_id, limit = 5}: {user_id: Memory['user_id'], limit: number}) {
        return this.db.prepare(`
        SELECT * from memories
        WHERE user_id = @user_id
        ORDER BY datetime(created_at) DESC
        LIMIT @limit
        `).all({user_id, limit}) as Memory[]
    }
    listByType({user_id, limit = 5, type}: {user_id: Memory['user_id'], type: Memory['type'], limit: number}) {
        return this.db.prepare(`
        SELECT * from memories
        WHERE user_id=@user_id AND type=@type
        ORDER BY datetime(created_at) DESC
        LIMIT=@limit
        `).all({user_id, limit, type}) as Memory[]
    }
    deleteMemory({id, user_id}: {id: Memory['id'], user_id: Memory['user_id']}) {
        return this.db.prepare(`
        DELETE from memories
        WHERE user_id=@user_id AND id=@id
        `).run({user_id, id})
    }
}