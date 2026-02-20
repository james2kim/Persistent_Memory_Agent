import type { Knex } from 'knex';
import { DocumentStore } from '../stores/DocumentStore';
import type { IngestDocument, RawChunk } from '../schemas/types';
import { defaultEmbedding } from '../services/EmbeddingService';
import { DocumentUtil } from '../util/DocumentUtil';

// simple concurrency limiter (no deps)
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

export async function ingestDocument(
  knex: Knex,
  stores: { documents: DocumentStore },
  input: IngestDocument,
  user_id: string
): Promise<{ documentId: string; chunkCount: number }> {
  return await knex.transaction(async (trx) => {
    const { id: documentId } = await stores.documents.upsertDocument(
      {
        source: input.source,
        title: input.title,
        metadata: input.metadata,
        user_id,
      },
      trx
    );

    const rawChunks: RawChunk[] = await DocumentUtil.chunkText(documentId, input.text);

    const embeddedChunks = await mapLimit(rawChunks, 4, async (c) => {
      const embedding = await defaultEmbedding.embedText(c.content, 'document');
      return {
        chunk_index: c.chunk_index,
        content: c.content,
        token_count: c.token_count,
        metadata: c.metadata ?? {},
        embedding,
      };
    });

    // 4) upsert chunks
    await stores.documents.upsertChunks({ documentId, chunks: embeddedChunks, user_id }, trx);

    return { documentId, chunkCount: embeddedChunks.length };
  });
}
