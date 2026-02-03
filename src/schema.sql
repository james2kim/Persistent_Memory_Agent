CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT
    user_id TEXT NOT NULL
    type TEXT NOT NULL CHECK(type IN ("fact", "preference", "goal", "decision", "summary"))
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confidence REAL NOT NULL
)

CREATE INDEX IF NOT EXISTS idx_memories_user_created
ON memories(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_user_type
ON memories(user_id, type);


