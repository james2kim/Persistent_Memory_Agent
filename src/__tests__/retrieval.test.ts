import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DocumentStore } from '../stores/DocumentStore';
import { DocumentUtil } from '../util/DocumentUtil';
import { defaultEmbedding } from '../services/EmbeddingService';
import { db } from '../db/knex';
import { TEST_QUERIES, TEST_DOCUMENTS, TEST_USER_ID } from './fixtures/testDocuments';

/**
 * Retrieval Quality Evaluation
 *
 * Metrics:
 * - MRR (Mean Reciprocal Rank): Average of 1/rank of first relevant result
 * - Recall@K: % of relevant docs found in top K results
 */

const MRR_THRESHOLD = 0.65;
const RECALL_K = 5;
const RECALL_THRESHOLD = 0.65;

let documentStore: DocumentStore;

const docIdToSource = new Map(TEST_DOCUMENTS.map((d) => [d.id, d.source]));

interface RetrievedChunk {
  id?: string;
  document_id?: string;
  document_source?: string;
  content: string;
}

function isRelevant(chunk: RetrievedChunk, relevantDocIds: string[]): boolean {
  const relevantSources = relevantDocIds.map((id) => docIdToSource.get(id)).filter(Boolean);
  return chunk.document_source !== undefined && relevantSources.includes(chunk.document_source);
}

function calculateRR(chunks: RetrievedChunk[], relevantDocIds: string[]): number {
  if (relevantDocIds.length === 0) {
    return chunks.length === 0 ? 1 : 0;
  }
  for (let i = 0; i < chunks.length; i++) {
    if (isRelevant(chunks[i], relevantDocIds)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function calculateRecallAtK(chunks: RetrievedChunk[], relevantDocIds: string[], k: number): number {
  if (relevantDocIds.length === 0) {
    return chunks.length === 0 ? 1 : 0;
  }
  const topK = chunks.slice(0, k);
  const foundDocIds = new Set<string>();
  for (const chunk of topK) {
    for (const docId of relevantDocIds) {
      const source = docIdToSource.get(docId);
      if (source && chunk.document_source === source) {
        foundDocIds.add(docId);
      }
    }
  }
  return foundDocIds.size / relevantDocIds.length;
}

async function evaluateQuery(testQuery: (typeof TEST_QUERIES)[0]) {
  const embedding = await defaultEmbedding.embedText(testQuery.query, 'query');
  const chunks = await DocumentUtil.retrieveRelevantChunks(
    documentStore,
    {
      queryEmbedding: embedding,
      user_id: TEST_USER_ID,
      topK: 30,
      userQuery: testQuery.query,
    },
    { maxChunks: 10, maxPerDoc: 4 }
  );

  return {
    testId: testQuery.id,
    rr: calculateRR(chunks, testQuery.relevantDocIds),
    recallAtK: calculateRecallAtK(chunks, testQuery.relevantDocIds, RECALL_K),
    chunks,
  };
}

describe('Retrieval Quality Evaluation', () => {
  beforeAll(async () => {
    documentStore = new DocumentStore(db, 1024);
    const count = await db('chunks').where('user_id', TEST_USER_ID).count('* as count').first();
    if (!count || Number(count.count) === 0) {
      throw new Error('No test data found. Run: npm run test:seed');
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('Aggregate Metrics', () => {
    it(`MRR should be >= ${MRR_THRESHOLD}`, async () => {
      const results = await Promise.all(TEST_QUERIES.map(evaluateQuery));
      const mrr = results.reduce((sum, r) => sum + r.rr, 0) / results.length;
      expect(mrr).toBeGreaterThanOrEqual(MRR_THRESHOLD);
    });

    it(`Recall@${RECALL_K} should be >= ${RECALL_THRESHOLD}`, async () => {
      const results = await Promise.all(TEST_QUERIES.map(evaluateQuery));
      const meanRecall = results.reduce((sum, r) => sum + r.recallAtK, 0) / results.length;
      expect(meanRecall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
    });
  });

  describe('Query Categories', () => {
    it('temporal queries should retrieve date-relevant docs', async () => {
      const queries = TEST_QUERIES.filter((q) => q.id.startsWith('temporal-'));
      const results = await Promise.all(queries.map(evaluateQuery));
      const avgRR = results.reduce((s, r) => s + r.rr, 0) / results.length;
      expect(avgRR).toBeGreaterThan(0);
    });

    it('semantic queries should retrieve meaning-relevant docs', async () => {
      const queries = TEST_QUERIES.filter((q) => q.id.startsWith('semantic-'));
      const results = await Promise.all(queries.map(evaluateQuery));
      const avgRR = results.reduce((s, r) => s + r.rr, 0) / results.length;
      expect(avgRR).toBeGreaterThan(0);
    });

    it('keyword queries should retrieve keyword-matching docs', async () => {
      const queries = TEST_QUERIES.filter((q) => q.id.startsWith('keyword-'));
      const results = await Promise.all(queries.map(evaluateQuery));
      const avgRR = results.reduce((s, r) => s + r.rr, 0) / results.length;
      expect(avgRR).toBeGreaterThan(0);
    });

    it('study queries should retrieve relevant study content', async () => {
      const queries = TEST_QUERIES.filter((q) => q.id.startsWith('study-'));
      const results = await Promise.all(queries.map(evaluateQuery));
      const avgRR = results.reduce((s, r) => s + r.rr, 0) / results.length;
      expect(avgRR).toBeGreaterThan(0);
    });

    it('edge case queries should still retrieve relevant docs', async () => {
      const queries = TEST_QUERIES.filter((q) => q.id.startsWith('edge-'));
      const results = await Promise.all(queries.map(evaluateQuery));
      const avgRR = results.reduce((s, r) => s + r.rr, 0) / results.length;
      expect(avgRR).toBeGreaterThan(0);
    });
  });

  describe('Disambiguation', () => {
    it('should rank semantically correct doc above keyword-similar doc', async () => {
      const disambigQueries = TEST_QUERIES.filter((q) => q.id.startsWith('disambig-'));
      let passCount = 0;

      for (const testQuery of disambigQueries) {
        const embedding = await defaultEmbedding.embedText(testQuery.query, 'query');
        const chunks = await DocumentUtil.retrieveRelevantChunks(
          documentStore,
          {
            queryEmbedding: embedding,
            user_id: TEST_USER_ID,
            topK: 30,
            userQuery: testQuery.query,
          },
          { maxChunks: 10, maxPerDoc: 3 }
        );

        const correctSources = testQuery.relevantDocIds
          .map((id) => docIdToSource.get(id))
          .filter(Boolean) as string[];

        const wrongSources = (testQuery.shouldNotMatchDocIds || [])
          .map((id) => docIdToSource.get(id))
          .filter(Boolean) as string[];

        let correctRank: number | null = null;
        let wrongRank: number | null = null;

        chunks.forEach((chunk, index) => {
          if (correctRank === null && correctSources.includes(chunk.document_source || '')) {
            correctRank = index + 1;
          }
          if (wrongRank === null && wrongSources.includes(chunk.document_source || '')) {
            wrongRank = index + 1;
          }
        });

        if (correctRank !== null && (wrongRank === null || correctRank < wrongRank)) {
          passCount++;
        }
      }

      const passRate = disambigQueries.length > 0 ? passCount / disambigQueries.length : 1;
      expect(passRate).toBeGreaterThanOrEqual(0.7);
    });
  });
});
