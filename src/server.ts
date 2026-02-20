import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';

import { RedisSessionStore } from './stores/RedisSessionStore';
import { RedisCheckpointer } from './memory/RedisCheckpointer';
import { getUserId } from './config';
import { buildWorkflow } from './agent/graph';
import { ingestDocument } from './ingest/ingestDocument';
import { DocumentStore } from './stores/DocumentStore';
import { db } from './db/knex';
import { runBackgroundSummarization } from './agent/backgroundTasks';
import { MAX_MESSAGES } from './agent/constants';

// Supported file types
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.md', '.txt'];
const SUPPORTED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/markdown',
  'text/plain',
];

// Convert Node.js Buffer to Blob
function bufferToBlob(buffer: Buffer, type: string): Blob {
  // Create a Uint8Array view of the buffer to use as BlobPart
  const uint8Array = new Uint8Array(buffer);
  return new Blob([uint8Array], { type });
}

// Extract text from uploaded file using LangChain loaders
async function extractTextFromFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string
): Promise<string> {
  const ext = path.extname(originalname).toLowerCase();

  // PDF files
  if (ext === '.pdf' || mimetype === 'application/pdf') {
    const blob = bufferToBlob(buffer, 'application/pdf');
    const loader = new PDFLoader(blob, { splitPages: false });
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  // Word documents (.docx)
  if (
    ext === '.docx' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const blob = bufferToBlob(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    const loader = new DocxLoader(blob);
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  // Legacy .doc files - try DocxLoader (may not work for all .doc files)
  if (ext === '.doc' || mimetype === 'application/msword') {
    const blob = bufferToBlob(buffer, 'application/msword');
    const loader = new DocxLoader(blob);
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  // Markdown and plain text files
  if (
    ext === '.md' ||
    ext === '.txt' ||
    mimetype === 'text/markdown' ||
    mimetype === 'text/plain'
  ) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${ext || mimetype}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Global state (initialized on startup)
let agentApp: ReturnType<typeof buildWorkflow>;
let sessionId: string;
let userId: string;
let documentStore: DocumentStore;

// Initialize the agent and session
async function initialize() {
  console.log('Connecting to Redis...');
  await RedisSessionStore.connect();

  const checkpointer = new RedisCheckpointer(RedisSessionStore);
  userId = getUserId();
  const session = await RedisSessionStore.getOrCreateSession(userId);
  sessionId = session.sessionId;

  agentApp = buildWorkflow(checkpointer);
  documentStore = new DocumentStore(db, 1024);

  console.log(`Session initialized: ${sessionId}`);
  console.log(`User ID: ${userId}`);
}

// Helper to get formatted response from the agent
async function getFormattedAnswerToUserinput(userQuery: string) {
  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userQuery,
    createdAt: new Date().toISOString(),
  };

  const result = await agentApp.invoke(
    {
      messages: [userMessage],
      userQuery: userQuery,
    },
    { configurable: { thread_id: sessionId } }
  );

  return result;
}

// API Routes

// POST /api/chat - Send a message and get a response
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await getFormattedAnswerToUserinput(message);

    // Send response immediately
    res.json({
      response: result?.response ?? '[No response generated]',
      sessionId,
    });

    // Run background summarization if needed (fire and forget)
    if (result?.messages && result.messages.length >= MAX_MESSAGES) {
      console.log(`[/api/chat] Triggering background summarization (${result.messages.length} messages)`);
      runBackgroundSummarization(
        sessionId,
        userId,
        result.messages,
        result.summary ?? ''
      ).catch((err) => console.error('[/api/chat] Background summarization error:', err));
    }
  } catch (err) {
    console.error('Error in /api/chat:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// POST /api/upload - Upload a document for ingestion
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const ext = path.extname(originalname).toLowerCase();

    // Validate file type
    if (!SUPPORTED_EXTENSIONS.includes(ext) && !SUPPORTED_MIMETYPES.includes(mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      });
    }

    // Extract text using LangChain loaders
    const textContent = await extractTextFromFile(buffer, originalname, mimetype);

    if (!textContent || textContent.trim().length === 0) {
      return res.status(400).json({
        error: 'Could not extract text from file. The file may be empty or corrupted.',
      });
    }

    const result = await ingestDocument(
      db,
      { documents: documentStore },
      {
        source: originalname,
        title: originalname,
        text: textContent,
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: originalname,
          mimeType: mimetype,
          fileType: ext,
        },
      },
      userId
    );

    res.json({
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      filename: originalname,
    });
  } catch (err) {
    console.error('Error in /api/upload:', err);
    const message = err instanceof Error ? err.message : 'Failed to process upload';
    res.status(500).json({ error: message });
  }
});

// GET /api/session - Get current session info
app.get('/api/session', async (req, res) => {
  try {
    const { state } = await RedisSessionStore.getSession(sessionId, userId);

    console.log('[/api/session] Session ID:', sessionId);
    console.log('[/api/session] Raw state keys:', Object.keys(state));
    console.log('[/api/session] Raw messages count:', state.messages?.length ?? 0);
    console.log(
      '[/api/session] Raw messages sample:',
      JSON.stringify(state.messages?.[0], null, 2)
    );

    // Also check the checkpointer directly
    const checkpointKey = `checkpoint:${sessionId}:latest`;
    const checkpointRaw = await RedisSessionStore.getClient().get(checkpointKey);
    if (checkpointRaw) {
      const checkpoint = JSON.parse(checkpointRaw);
      const cpMessages = checkpoint?.checkpoint?.channel_values?.messages;
      console.log('[/api/session] Checkpoint messages count:', cpMessages?.length ?? 0);
      console.log(
        '[/api/session] Checkpoint message sample:',
        JSON.stringify(cpMessages?.[0], null, 2)
      );
    } else {
      console.log('[/api/session] No checkpoint found for key:', checkpointKey);
    }

    // Normalize LangChain messages to plain objects
    const normalizedMessages = (state.messages || [])
      .map((msg: unknown) => {
        const m = msg as Record<string, unknown>;

        // Check if already a plain object with role
        if (typeof m.role === 'string' && typeof m.content === 'string') {
          return { role: m.role, content: m.content };
        }

        // LangChain serialized format:
        // { id: ["langchain_core", "messages", "HumanMessage"], kwargs: { content: "..." } }
        const msgId = m.id as string[] | undefined;
        const kwargs = m.kwargs as Record<string, unknown> | undefined;
        const msgType = Array.isArray(msgId) ? (msgId[2]?.toLowerCase() || '') : '';

        // Determine role
        let role = 'system';
        if (msgType.includes('human')) {
          role = 'user';
        } else if (msgType.includes('ai')) {
          role = 'assistant';
        } else if (msgType.includes('tool')) {
          role = 'system'; // Skip tool messages or show as system
        }

        // Extract content from kwargs
        let content = kwargs?.content ?? m.content ?? '';
        if (Array.isArray(content)) {
          content = content
            .map((c: unknown) =>
              typeof c === 'string' ? c : (c as Record<string, unknown>).text || ''
            )
            .join('');
        }

        return { role, content: String(content) };
      })
      .filter(
        (m: { content: string; role: string }) =>
          m.content && m.content.trim().length > 0 && m.role !== 'system'
      );

    console.log('[/api/session] Normalized messages count:', normalizedMessages.length);

    res.json({
      sessionId,
      messages: normalizedMessages,
    });
  } catch (err) {
    console.error('Error in /api/session:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
async function main() {
  try {
    await initialize();

    app.listen(PORT, () => {
      console.log(`\nServer running at http://localhost:${PORT}`);
      console.log('Press Ctrl+C to stop.\n');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await RedisSessionStore.disconnect();
  await db.destroy();
  process.exit(0);
});

main();
