# Persistent Memory Study Agent

A conversational AI agent with persistent memory across sessions. Built with LangGraph, Redis, and SQLite.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Workflow                       │
│  ┌──────────────────┐      ┌─────────────────────────────┐  │
│  │  classifyIntent  │─────▶│  executeTools (if needed)   │  │
│  │  (Node 1)        │◀─────│  (Node 2)                   │  │
│  └────────┬─────────┘      └─────────────────────────────┘  │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐      ┌─────────────────────────────┐  │
│  │  extractMemory   │─────▶│  summarizeMessages          │  │
│  │  (Node 3)        │      │  (Node 4, if needed)        │  │
│  └──────────────────┘      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌─────────────────────┐
│     SQLite      │          │       Redis         │
│  (Long-term)    │          │   (Short-term)      │
│                 │          │                     │
│  • Facts        │          │  • Messages         │
│  • Preferences  │          │  • Session state    │
│  • Goals        │          │  • Summary          │
│  • Decisions    │          │  • Checkpoints      │
└─────────────────┘          └─────────────────────┘
```

## Memory Architecture

### Short-Term Memory (Redis)

Session-scoped memory that persists across application restarts:

| Key | Purpose |
|-----|---------|
| `session:<id>` | Current session state (messages, summary, metadata) |
| `checkpoint:<id>:latest` | LangGraph checkpoint for workflow resumption |
| `user:<id>:active_session` | Maps user to their active session |

**Why Redis?**
- Fast read/write for frequent message updates
- TTL support for session expiration
- Survives application crashes

### Long-Term Memory (SQLite)

Permanent storage for extracted knowledge:

| Field | Description |
|-------|-------------|
| `type` | fact, preference, goal, decision, summary |
| `content` | The extracted memory content |
| `confidence` | 0.0-1.0 extraction confidence |
| `embedding` | VoyageAI embedding for semantic search |

**Why SQLite?**
- Simple, file-based, no server needed
- Good enough for single-user scenarios
- Easy to inspect and debug

## Workflow Nodes

### Node 1: classifyIntent
Routes between tool calls and direct responses. Binds available tools to the LLM and invokes with conversation history.

### Node 2: executeTools
Validates tool arguments against Zod schemas, executes tools, and returns results as ToolMessages.

### Node 3: extractMemory
Extracts facts, preferences, goals, and decisions from user messages. Uses semantic deduplication (cosine similarity ≥ 0.9) to avoid storing duplicates.

### Node 4: summarizeMessages
Triggers when messages exceed `MAX_MESSAGES`. Summarizes oldest messages, merges with existing summary, and prunes using `RemoveMessage`.

## Key Design Decisions

### 1. Dual Memory System
- **Short-term (Redis)**: Full conversation history for context
- **Long-term (SQLite)**: Extracted facts that persist forever

This separation allows the agent to "remember" important information even after conversation history is summarized/pruned.

### 2. Custom Checkpointer
LangGraph's checkpointer is extended to sync state to our Redis session store. This provides:
- Workflow resumption after crashes
- Session state accessible outside the graph

### 3. MessagesValue Reducer
Using LangGraph's `MessagesValue` for automatic message appending instead of manual array spreading. Supports `RemoveMessage` for safe pruning.

### 4. Safe Message Pruning
The `findSafeCutIndex` function ensures we never split tool_use/tool_result pairs when summarizing, which would cause API errors.

### 5. Semantic Deduplication
Before adding a memory, we check for existing memories with cosine similarity ≥ 0.9. This prevents storing "User likes TypeScript" multiple times.

### 6. User ID from Config
User ID is stored in `~/.memory-agent.json` and persists across sessions. This allows the agent to maintain separate memory stores per user.

## Project Structure

```
src/
├── main.ts                 # CLI entry point
├── config.ts               # User ID management
│
├── agent/
│   ├── constants.ts        # Model, system prompt, limits
│   ├── graph.ts            # Workflow definition
│   ├── routers.ts          # Conditional routing logic
│   └── nodes/
│       ├── classifyIntent.ts
│       ├── executeTools.ts
│       ├── extractMemory.ts
│       └── summarize.ts
│
├── memory/
│   ├── extractMemories.ts  # LLM-based memory extraction
│   ├── summarizeMessages.ts
│   ├── MemoryUtil.ts       # Search, similarity, relevance
│   ├── EmbeddingService.ts # VoyageAI embeddings
│   ├── redis/
│   │   ├── RedisSessionStore.ts
│   │   └── RedisCheckpointer.ts
│   └── sql/
│       └── SqlMemoryStore.ts
│
├── schemas/
│   └── types.ts            # Zod schemas and types
│
└── tools/
    └── tools.ts            # searchMemories tool
```

## Setup

### Prerequisites
- Node.js 18+
- Redis server running locally

### Installation

```bash
# Install dependencies
npm install

# Start Redis (macOS)
brew services start redis

# Create .env.local
cp .env.example .env.local
# Add your API keys:
# ANTHROPIC_API_KEY=...
# VOYAGE_API_KEY=...
# REDIS_URL=redis://localhost:6379
```

### Running

```bash
npx tsx src/main.ts
```

## Inspecting State

### Redis
```bash
# List all keys
redis-cli KEYS "*"

# View session state
redis-cli GET "session:<id>" | python3 -m json.tool

# Monitor in real-time
redis-cli MONITOR
```

### SQLite
```bash
# View memories
sqlite3 -header -box memory.sqlite "SELECT id, type, confidence, content FROM memories;"
```

## Configuration

| Constant | Location | Default | Description |
|----------|----------|---------|-------------|
| `MAX_MESSAGES` | `agent/constants.ts` | 40 | Triggers summarization |
| `MAX_TOOL_ATTEMPTS` | `agent/constants.ts` | 3 | Max tool retries |
| `SIMILARITY_THRESHOLD` | `sql/SqlMemoryStore.ts` | 0.9 | Deduplication threshold |

## Limitations

- Single user (no multi-tenancy)
- No memory decay/expiration
- No explicit "save this" command
- Embedding costs for every memory check

## Future Improvements

- [ ] Add LangSmith tracing
- [ ] Memory consolidation (merge similar memories)
- [ ] Explicit write memory tool
- [ ] Memory importance ranking
- [ ] Multi-user support with auth
