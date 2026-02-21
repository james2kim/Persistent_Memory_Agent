import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { RawChunk, RetrievedChunk, DocumentChunk } from '../schemas/types';
import type { DocumentStore } from '../stores/DocumentStore';
import { extractQueryYear } from './TemporalUtil';

// Budget constraints for document retrieval
const DEFAULT_BUDGET = {
  maxContextTokens: 2500,
  maxChunks: 8,
  maxPerDoc: 4,
  maxChunkTokens: 700,
};

export type BudgetOptions = {
  maxContextTokens?: number;
  maxChunks?: number;
  maxPerDoc?: number;
  maxChunkTokens?: number;
};

export const DocumentUtil = {
  estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  },

  cosineSimilarity(a: number[], b: number[]) {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) {
      return 0;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  },

  removeDuplicateChunks(chunks: RetrievedChunk[], threshold = 0.92) {
    const kept: RetrievedChunk[] = [];

    for (const c of chunks) {
      if (!c.embedding?.length) {
        kept.push(c);
        continue;
      }

      let isDup = false;
      for (const k of kept) {
        if (!k.embedding?.length) continue;

        const sim = this.cosineSimilarity(c.embedding, k.embedding);
        if (sim >= threshold) {
          isDup = true;
          break;
        }
      }

      if (!isDup) kept.push(c);
    }

    return kept;
  },

  async chunkText(
    documentId: string,
    text: string,
    opts?: { maxTokensPerChunk?: number; overlapTokens?: number }
  ): Promise<RawChunk[]> {
    const maxTokens = opts?.maxTokensPerChunk ?? 600;
    const overlapTokens = opts?.overlapTokens ?? 200;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: maxTokens,
      chunkOverlap: overlapTokens,
      lengthFunction: (t) => Math.ceil(t.length / 4),
    });

    const chunks = await splitter.splitText(text);

    return chunks
      .map((content, index) => ({
        chunk_index: index,
        content: content.trim(),
        token_count: Math.ceil(content.length / 4),
        metadata: {},
      }))
      .filter((c) => c.content.length > 0);
  },
  passRelevanceRules(chunk: RetrievedChunk) {
    const text = chunk.content?.trim() ?? '';
    if (text.length < 30) return false;

    const uploadedAtRaw = (chunk.metadata?.uploadedAt as string | undefined) ?? chunk.created_at;

    const uploadedAt = new Date(uploadedAtRaw);
    if (Number.isNaN(uploadedAt.getTime())) return false;

    const daysSinceUpload = (Date.now() - uploadedAt.getTime()) / 86400000;

    const maxAgeDays = 360;
    if (daysSinceUpload > maxAgeDays) return false;

    const fileType = chunk.metadata?.fileType as string | undefined;
    if (fileType && !['pdf', 'txt', 'md', 'docx'].includes(fileType)) return false;

    return true;
  },

  /**
   * Apply budget constraints to retrieved chunks.
   * Chunks should be pre-sorted by relevance (most relevant first).
   *
   * Constraints applied in order:
   * 1. Filter chunks exceeding maxChunkTokens
   * 2. Limit chunks per document to maxPerDoc
   * 3. Limit total chunks to maxChunks
   * 4. Limit total context tokens to maxContextTokens
   */
  applyBudget(chunks: DocumentChunk[], options?: BudgetOptions): DocumentChunk[] {
    const {
      maxContextTokens = DEFAULT_BUDGET.maxContextTokens,
      maxChunks = DEFAULT_BUDGET.maxChunks,
      maxPerDoc = DEFAULT_BUDGET.maxPerDoc,
      maxChunkTokens = DEFAULT_BUDGET.maxChunkTokens,
    } = options ?? {};

    const tokenCount = (c: DocumentChunk) => {
      const t = c.token_count;
      if (typeof t === 'number' && t > 0) return t;
      // ~4 chars/token heuristic
      return Math.ceil((c.content?.length ?? 0) / 4);
    };

    // 1) Filter *softly*: keep the first chunk even if it’s large
    const validChunks: DocumentChunk[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const t = tokenCount(c);
      if (t <= maxChunkTokens || i === 0) validChunks.push(c);
    }

    // 2) Limit chunks per document
    const docCounts = new Map<string, number>();
    const perDocFiltered: DocumentChunk[] = [];

    for (const chunk of validChunks) {
      const docId = chunk.document_id ?? '__unknown__';
      const count = docCounts.get(docId) ?? 0;
      if (count < maxPerDoc) {
        perDocFiltered.push(chunk);
        docCounts.set(docId, count + 1);
      }
    }

    // 3 & 4) Limit total chunks and total tokens
    const selected: DocumentChunk[] = [];
    let totalTokens = 0;

    for (const chunk of perDocFiltered) {
      if (selected.length >= maxChunks) break;

      const t = tokenCount(chunk);
      if (totalTokens + t > maxContextTokens) continue; // <-- key fix

      selected.push(chunk);
      totalTokens += t;
    }

    return selected;
  },
  calculateMinDAndRange(chunks: DocumentChunk[]) {
    // Confidence is computed by calculating which chunk has the smallest cosine distance from the embedded query
    const distances = chunks.map((c) => c.distance);
    const minD = Math.min(...distances);
    const maxD = Math.max(...distances);
    const range = Math.max(1e-9, maxD - minD);

    return {
      range,
      minD,
    };
  },
  /**
   * Retrieve relevant chunks from the document store.
   *
   * Pipeline:
   * 1. Hybrid search (embedding similarity + keyword matching + temporal filter)
   * 2. Filter by relevance rules
   * 3. Remove near-duplicate chunks
   * 4. Apply budget constraints
   */
  async retrieveRelevantChunks(
    store: DocumentStore,
    input: {
      queryEmbedding: number[];
      user_id: string;
      topK?: number;
      userQuery: string;
    },
    budgetOptions?: BudgetOptions
  ): Promise<DocumentChunk[]> {
    const topK = input.topK ?? 20;

    // Extract year from query for temporal filtering
    const filterYear = extractQueryYear(input.userQuery);
    if (filterYear) {
      console.log(`[pipeline] Temporal filter: year=${filterYear}`);
    }

    // 1. Hybrid search: embedding similarity + keyword matching
    const rawChunks = await store.hybridSearch({
      query: input.userQuery,
      queryEmbedding: input.queryEmbedding,
      user_id: input.user_id,
      topK,
      filterYear: filterYear ?? undefined,
    });

    if (rawChunks.length === 0) {
      return [];
    }

    // Extended type to carry distance and document info through pipeline
    type ChunkWithDistance = RetrievedChunk & {
      distance: number;
      document_title?: string;
      document_source?: string;
    };

    const extendedChunks: ChunkWithDistance[] = rawChunks.map((chunk) => ({
      id: chunk.id,
      document_id: chunk.document_id,
      document_title: chunk.document_title,
      document_source: chunk.document_source,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      token_count: chunk.token_count,
      metadata: chunk.metadata,
      created_at: chunk.created_at,
      embedding: chunk.embedding,
      distance: chunk.distance,
    }));

    // Debug: check if Axiom chunk is in raw results
    const hasAxiomRaw = extendedChunks.some((c) => c.content.includes('Axiom'));
    console.log(`[pipeline] Raw chunks: ${extendedChunks.length}, has Axiom: ${hasAxiomRaw}`);

    // 2. Filter by relevance rules
    const relevant = extendedChunks.filter((chunk) => this.passRelevanceRules(chunk));
    const hasAxiomRelevant = relevant.some((c) => c.content.includes('Axiom'));
    console.log(
      `[pipeline] After relevance filter: ${relevant.length}, has Axiom: ${hasAxiomRelevant}`
    );

    // 3. Remove near-duplicates (cast to RetrievedChunk for the function, then back)
    const deduped = this.removeDuplicateChunks(relevant) as ChunkWithDistance[];
    const hasAxiomDeduped = deduped.some((c) => c.content.includes('Axiom'));
    console.log(`[pipeline] After dedup: ${deduped.length}, has Axiom: ${hasAxiomDeduped}`);
    // 4. Convert to DocumentChunk format for budget application
    const documentChunks: DocumentChunk[] = deduped.map((chunk) => ({
      id: chunk.id,
      document_id: chunk.document_id,
      document_title: chunk.document_title,
      document_source: chunk.document_source,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      token_count: chunk.token_count,
      metadata: chunk.metadata,
      created_at: chunk.created_at,
      embedding: chunk.embedding,
      distance: chunk.distance,
      // Absolute confidence: 1.0 at distance=0, 0.0 at distance=1
      confidence: Math.max(0, 1 - chunk.distance),
    }));

    // 6. Apply budget constraints (keeps first N = most relevant)
    return this.applyBudget(documentChunks, budgetOptions);
  },
};
