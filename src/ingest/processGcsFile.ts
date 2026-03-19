import path from 'path';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { downloadAsBuffer, deleteFile } from '../util/GcsUtil.js';
import { ingestDocument } from './ingestDocument.js';
import { TitleExtractor } from '../util/TitleExtractor.js';
import { DocumentStore } from '../stores/DocumentStore.js';
import { summarizeDocumentText } from '../llm/summarizeDocument.js';
import { db } from '../db/knex.js';

type ExtractedContent = {
  text: string;
  pdfTitle?: string;
};

function bufferToBlob(buffer: Buffer, type: string): Blob {
  const uint8Array = new Uint8Array(buffer);
  return new Blob([uint8Array], { type });
}

export async function extractTextFromFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string
): Promise<ExtractedContent> {
  const ext = path.extname(originalname).toLowerCase();

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    const blob = bufferToBlob(buffer, 'application/pdf');
    const loader = new PDFLoader(blob, { splitPages: false });
    const docs = await loader.load();
    const text = docs.map((doc) => doc.pageContent).join('\n\n');
    const pdfTitle = docs[0]?.metadata?.pdf?.info?.Title as string | undefined;
    return { text, pdfTitle };
  }

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
    return { text: docs.map((doc) => doc.pageContent).join('\n\n') };
  }

  if (ext === '.doc' || mimetype === 'application/msword') {
    const blob = bufferToBlob(buffer, 'application/msword');
    const loader = new DocxLoader(blob);
    const docs = await loader.load();
    return { text: docs.map((doc) => doc.pageContent).join('\n\n') };
  }

  if (
    ext === '.md' ||
    ext === '.txt' ||
    mimetype === 'text/markdown' ||
    mimetype === 'text/plain'
  ) {
    return { text: buffer.toString('utf-8') };
  }

  throw new Error(`Unsupported file type: ${ext || mimetype}`);
}

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

export type ProgressStage = 'downloading' | 'extracting_text' | 'embedding' | 'summarizing' | 'cleaning_up' | 'completed';

export interface ProcessGcsFileOptions {
  userId: string;
  gcsPath: string;
  filename: string;
  onProgress?: (stage: ProgressStage, detail?: string) => void;
}

export async function processGcsFile({
  userId,
  gcsPath,
  filename,
  onProgress,
}: ProcessGcsFileOptions): Promise<{ documentId: string; chunkCount: number; filename: string; title: string }> {
  const documentStore = new DocumentStore(db, 1024);

  onProgress?.('downloading', `Downloading ${filename} from storage`);
  const buffer = await downloadAsBuffer(gcsPath);

  const ext = path.extname(filename).toLowerCase();
  const mimetype = MIME_MAP[ext] || 'application/octet-stream';

  onProgress?.('extracting_text', `Extracting text from ${filename}`);
  const { text: textContent, pdfTitle } = await extractTextFromFile(buffer, filename, mimetype);

  if (!textContent || textContent.trim().length === 0) {
    await deleteFile(gcsPath).catch(() => {});
    throw new Error('Could not extract text from file. The file may be empty or corrupted.');
  }

  const extractedTitle = pdfTitle || TitleExtractor.extractTitle(textContent, filename);
  console.log(`[processGcsFile] Title: "${extractedTitle}" (from PDF metadata: ${!!pdfTitle})`);

  onProgress?.('embedding', `Embedding ${filename}`);
  const result = await ingestDocument(
    db,
    { documents: documentStore },
    {
      source: filename,
      title: extractedTitle,
      text: textContent,
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalName: filename,
        mimeType: mimetype,
        fileType: ext,
      },
    },
    userId
  );

  onProgress?.('summarizing', 'Generating document summary');
  try {
    const summary = await summarizeDocumentText(textContent);
    await documentStore.updateSummary(result.documentId, summary);
    console.log(`[processGcsFile] Summary generated for ${result.documentId}`);
  } catch (err) {
    console.error('[processGcsFile] Summary generation failed (non-fatal):', err);
  }

  onProgress?.('cleaning_up', 'Removing temporary file from storage');
  await deleteFile(gcsPath).catch((err) =>
    console.error('[processGcsFile] Failed to delete GCS file:', err)
  );

  onProgress?.('completed');
  return { documentId: result.documentId, chunkCount: result.chunkCount, filename, title: extractedTitle };
}
