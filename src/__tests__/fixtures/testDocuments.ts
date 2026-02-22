export const TEST_USER_ID = 'test-user-retrieval-eval';

/**
 * Test documents for retrieval evaluation.
 *
 * Design principles:
 * - Each document has clear, distinct content
 * - Temporal ranges are explicit for temporal query testing
 * - Some overlap exists to test deduplication/ranking
 * - Includes edge cases (semantic-only matches, keyword-only matches)
 */

export interface TestDocument {
  id: string;
  title: string;
  source: string;
  content: string;
  // Expected queries that should retrieve this document
  expectedQueries: string[];
}

export const TEST_DOCUMENTS: TestDocument[] = [
  // ============================================================================
  // WORK EXPERIENCE DOCUMENTS
  // ============================================================================
  {
    id: 'resume-axiom',
    title: 'Resume - Axiom Experience',
    source: 'resume_axiom.txt',
    content: `Software Engineer at Axiom
June 2022 – Present

Role: Full-stack engineer working on data infrastructure and visualization tools.

Key Accomplishments:
- Built real-time data pipeline processing 10M events/day
- Designed query language for log analysis
- Led migration from MongoDB to ClickHouse, reducing query latency by 80%
- Mentored 2 junior engineers

Technologies: TypeScript, React, Go, ClickHouse, Kubernetes

This role involves working with observability tools and helping customers debug production issues.`,
    expectedQueries: [
      'What did I do at Axiom?',
      'Tell me about my work experience',
      'What technologies have I used?',
      'What did I do in 2023?',
      'What did I do in 2024?',
    ],
  },
  {
    id: 'resume-startup',
    title: 'Resume - Startup Experience',
    source: 'resume_startup.txt',
    content: `Software Engineer at TechStartup Inc
January 2020 – May 2022

Role: Backend engineer focused on payment systems and API development.

Key Accomplishments:
- Implemented Stripe integration handling $2M monthly transactions
- Built REST API serving 500 requests/second
- Reduced infrastructure costs by 40% through optimization
- On-call rotation for production incidents

Technologies: Python, Django, PostgreSQL, Redis, AWS

Left to join Axiom for growth opportunities in the observability space.`,
    expectedQueries: [
      'What did I do before Axiom?',
      'Tell me about my startup experience',
      'What did I do in 2021?',
      'Have I worked with payment systems?',
    ],
  },

  // ============================================================================
  // STUDY NOTES
  // ============================================================================
  {
    id: 'notes-ml-basics',
    title: 'Machine Learning Fundamentals',
    source: 'ml_notes.md',
    content: `# Machine Learning Fundamentals

## Supervised Learning
Supervised learning uses labeled data to train models. The algorithm learns a mapping from inputs to outputs.

Common algorithms:
- Linear Regression: Predicts continuous values
- Logistic Regression: Binary classification
- Decision Trees: Hierarchical decision making
- Random Forests: Ensemble of decision trees
- Neural Networks: Deep learning approach

## Key Concepts
- Training set vs test set (typically 80/20 split)
- Overfitting: Model memorizes training data
- Underfitting: Model too simple to capture patterns
- Cross-validation: K-fold validation for robust evaluation

## Loss Functions
- MSE (Mean Squared Error): For regression
- Cross-entropy: For classification
- Hinge loss: For SVM`,
    expectedQueries: [
      'What is supervised learning?',
      'Explain overfitting',
      'What are common ML algorithms?',
      'How do I evaluate a model?',
    ],
  },
  {
    id: 'notes-rag',
    title: 'RAG Architecture Notes',
    source: 'rag_notes.md',
    content: `# Retrieval Augmented Generation (RAG)

## Overview
RAG combines retrieval systems with language models. Instead of relying solely on parametric knowledge, the model retrieves relevant documents and uses them as context.

## Components
1. Document Store: Vector database (pgvector, Pinecone, Weaviate)
2. Embedding Model: Converts text to vectors (OpenAI, Voyage, Cohere)
3. Retriever: Finds relevant chunks via similarity search
4. Generator: LLM that produces final answer

## Key Challenges
- Lost in the Middle: LLMs attend poorly to middle context
- Chunk size tradeoffs: Too small = missing context, too large = noise
- Hybrid search: Combining semantic + keyword search

## Evaluation Metrics
- MRR (Mean Reciprocal Rank): Position of first relevant result
- Recall@K: Fraction of relevant docs in top K
- NDCG: Normalized discounted cumulative gain`,
    expectedQueries: [
      'What is RAG?',
      'How do I evaluate retrieval?',
      'What is lost in the middle?',
      'Explain hybrid search',
    ],
  },
  {
    id: 'notes-system-design',
    title: 'System Design Interview Notes',
    source: 'system_design.md',
    content: `# System Design Notes

## Scalability Patterns
- Horizontal scaling: Add more machines
- Vertical scaling: Bigger machine
- Load balancing: Distribute traffic (round-robin, least connections)
- Caching: Redis, Memcached for hot data

## Database Choices
- PostgreSQL: ACID, complex queries, joins
- MongoDB: Flexible schema, document model
- ClickHouse: Analytics, columnar storage
- Redis: In-memory, cache/sessions

## CAP Theorem
You can only have 2 of 3:
- Consistency: All nodes see same data
- Availability: System responds to requests
- Partition tolerance: System works despite network failures

## Common Interview Topics
- URL shortener: Hash function, collision handling
- Rate limiter: Token bucket, sliding window
- Chat system: WebSockets, message queues
- News feed: Fan-out on write vs read`,
    expectedQueries: [
      'Explain CAP theorem',
      'How do I scale a database?',
      'System design interview topics',
      'When to use Redis?',
    ],
  },

  // ============================================================================
  // DISAMBIGUATION TEST DOCUMENTS
  // ============================================================================
  {
    id: 'notes-math-axioms',
    title: 'Mathematical Axioms and Proofs',
    source: 'math_axioms.md',
    content: `# Axioms in Mathematics

## What is an Axiom?
An axiom is a statement that is taken to be true without proof. Axioms serve as the starting point for logical reasoning and proofs in mathematics. They are self-evident truths that form the foundation of a mathematical system.

## Examples of Famous Axioms

### Euclid's Axioms (Geometry)
1. A straight line can be drawn between any two points
2. A line segment can be extended indefinitely
3. A circle can be drawn with any center and radius
4. All right angles are equal
5. Parallel postulate: If a line intersects two other lines and the interior angles on one side sum to less than 180°, the lines will meet on that side

### Peano Axioms (Natural Numbers)
1. 0 is a natural number
2. Every natural number has a successor
3. 0 is not the successor of any natural number
4. Different numbers have different successors
5. Induction axiom: If a property holds for 0 and holds for n+1 whenever it holds for n, then it holds for all natural numbers

## Axioms vs Theorems
- Axiom: Assumed true, no proof required
- Theorem: Must be proven using axioms and previously proven theorems

## Role in Formal Systems
Axioms define the rules of a formal system. Different axiom sets create different mathematical systems. For example, changing Euclid's parallel postulate leads to non-Euclidean geometries.`,
    expectedQueries: [
      'What is an axiom in mathematics?',
      'Explain Euclid axioms',
      'What are Peano axioms?',
      'Difference between axiom and theorem',
    ],
  },

  // ============================================================================
  // EDGE CASES
  // ============================================================================
  {
    id: 'notes-semantic-only',
    title: 'Career Reflections',
    source: 'reflections.md',
    content: `# Thoughts on My Professional Journey

Looking back at my time building software, the most valuable skill wasn't any specific technology. It was learning to break down ambiguous problems into concrete steps.

Early in my career, I would jump straight to coding. Now I spend more time understanding the problem space, talking to users, and considering edge cases before writing a single line.

The transition from individual contributor to someone who mentors others was challenging. Teaching forces you to truly understand concepts, not just apply them mechanically.

What I enjoy most is the intersection of engineering and product thinking. Building something technically impressive means nothing if it doesn't solve a real problem.`,
    expectedQueries: [
      'What have I learned in my career?',
      'How has my approach to engineering changed?',
      // Note: No explicit keywords like "work" or "experience" but semantically related
    ],
  },
  {
    id: 'notes-biology',
    title: 'Biology 101 Notes',
    source: 'biology_notes.md',
    content: `# Cellular Biology

## Cell Structure
- Nucleus: Contains DNA, controls cell activities
- Mitochondria: Powerhouse of the cell, produces ATP
- Ribosomes: Protein synthesis
- Endoplasmic reticulum: Transport system

## Cellular Respiration
The process of converting glucose to ATP (energy).

C6H12O6 + 6O2 → 6CO2 + 6H2O + ATP

Stages:
1. Glycolysis (cytoplasm): Glucose → Pyruvate
2. Krebs Cycle (mitochondria): Pyruvate → CO2 + electrons
3. Electron Transport Chain: Electrons → ATP

## Photosynthesis
6CO2 + 6H2O + light → C6H12O6 + 6O2

Occurs in chloroplasts. Light-dependent and light-independent reactions.`,
    expectedQueries: [
      'What is cellular respiration?',
      'Explain the mitochondria',
      'How does photosynthesis work?',
    ],
  },
];

/**
 * Test queries with expected document matches.
 * Used for MRR and Recall@K evaluation.
 */
export interface TestQuery {
  id: string;
  query: string;
  description: string;
  // Document IDs that should be retrieved
  relevantDocIds: string[];
  // Optional: specific content that must appear in results
  requiredContent?: string[];
  // Optional: document IDs that should NOT be retrieved (for hard negatives)
  shouldNotMatchDocIds?: string[];
}

export const TEST_QUERIES: TestQuery[] = [
  // ==========================================================================
  // TEMPORAL QUERIES - Test date range filtering
  // ==========================================================================
  {
    id: 'temporal-2023-explicit',
    query: 'What did I do in 2023?',
    description: 'Explicit year - should retrieve Axiom (June 2022 - Present)',
    relevantDocIds: ['resume-axiom'],
    requiredContent: ['Axiom'],
  },
  {
    id: 'temporal-2021-explicit',
    query: 'What was I working on in 2021?',
    description: 'Explicit year - should retrieve startup (Jan 2020 - May 2022)',
    relevantDocIds: ['resume-startup'],
    requiredContent: ['TechStartup'],
  },
  {
    id: 'temporal-2024-explicit',
    query: 'What am I doing in 2024?',
    description: 'Current year - should retrieve Axiom (Present)',
    relevantDocIds: ['resume-axiom'],
  },
  {
    id: 'temporal-2020-boundary',
    query: 'What projects did I work on in early 2020?',
    description: 'Boundary test - startup started Jan 2020',
    relevantDocIds: ['resume-startup'],
  },
  {
    id: 'temporal-2022-overlap',
    query: 'What was I doing in mid 2022?',
    description: 'Overlap period - both jobs active (startup ended May, Axiom started June)',
    relevantDocIds: ['resume-axiom', 'resume-startup'],
  },

  // ==========================================================================
  // SEMANTIC QUERIES - Meaning without exact keywords
  // ==========================================================================
  {
    id: 'semantic-career-growth',
    query: 'How have I grown as an engineer?',
    description: 'Career reflection - no direct keyword match',
    relevantDocIds: ['notes-semantic-only', 'resume-axiom', 'resume-startup'],
  },
  {
    id: 'semantic-mentoring',
    query: 'Have I mentored anyone?',
    description: 'Mentoring - appears in Axiom resume and reflections',
    relevantDocIds: ['resume-axiom', 'notes-semantic-only'],
    requiredContent: ['mentor'],
  },
  {
    id: 'semantic-leadership',
    query: 'What leadership experience do I have?',
    description: 'Leadership implies mentoring, leading migrations',
    relevantDocIds: ['resume-axiom', 'notes-semantic-only'],
  },
  {
    id: 'semantic-problem-solving',
    query: 'How do I approach solving problems?',
    description: 'Problem-solving philosophy in reflections',
    relevantDocIds: ['notes-semantic-only'],
  },
  {
    id: 'semantic-job-history',
    query: 'Walk me through my professional background',
    description: 'Paraphrase of "work experience"',
    relevantDocIds: ['resume-axiom', 'resume-startup'],
  },
  {
    id: 'semantic-accomplishments',
    query: 'What are my biggest achievements?',
    description: 'Should find accomplishments sections',
    relevantDocIds: ['resume-axiom', 'resume-startup'],
  },

  // ==========================================================================
  // KEYWORD QUERIES - Direct term matching
  // ==========================================================================
  {
    id: 'keyword-axiom',
    query: 'Axiom',
    description: 'Single keyword - should match company name',
    relevantDocIds: ['resume-axiom', 'resume-startup'],
    requiredContent: ['Axiom'],
  },
  {
    id: 'keyword-clickhouse',
    query: 'ClickHouse migration',
    description: 'Technical term in resume',
    relevantDocIds: ['resume-axiom', 'notes-system-design'],
  },
  {
    id: 'keyword-stripe',
    query: 'Stripe integration',
    description: 'Payment system keyword',
    relevantDocIds: ['resume-startup'],
    requiredContent: ['Stripe'],
  },
  {
    id: 'keyword-kubernetes',
    query: 'Kubernetes',
    description: 'Technology keyword',
    relevantDocIds: ['resume-axiom'],
  },
  {
    id: 'keyword-overfitting',
    query: 'overfitting underfitting',
    description: 'ML concept keywords',
    relevantDocIds: ['notes-ml-basics'],
  },

  // ==========================================================================
  // STUDY CONTENT QUERIES
  // ==========================================================================
  {
    id: 'study-ml-basics',
    query: 'Explain machine learning basics',
    description: 'Broad ML query',
    relevantDocIds: ['notes-ml-basics'],
  },
  {
    id: 'study-ml-algorithms',
    query: 'What are common machine learning algorithms?',
    description: 'Specific ML subtopic',
    relevantDocIds: ['notes-ml-basics'],
  },
  {
    id: 'study-rag-overview',
    query: 'How does RAG retrieval work?',
    description: 'RAG architecture query',
    relevantDocIds: ['notes-rag'],
    requiredContent: ['RAG'],
  },
  {
    id: 'study-rag-evaluation',
    query: 'How do I evaluate a retrieval system?',
    description: 'Should find MRR, Recall@K in RAG notes',
    relevantDocIds: ['notes-rag'],
    requiredContent: ['MRR'],
  },
  {
    id: 'study-lost-middle',
    query: 'What is the lost in the middle problem?',
    description: 'Specific RAG concept',
    relevantDocIds: ['notes-rag'],
    requiredContent: ['middle'],
  },
  {
    id: 'study-cap-theorem',
    query: 'Explain CAP theorem',
    description: 'System design concept',
    relevantDocIds: ['notes-system-design'],
  },
  {
    id: 'study-biology-respiration',
    query: 'What is cellular respiration?',
    description: 'Biology concept',
    relevantDocIds: ['notes-biology'],
    requiredContent: ['respiration'],
  },
  {
    id: 'study-biology-mitochondria',
    query: 'What do mitochondria do?',
    description: 'Biology - powerhouse of the cell',
    relevantDocIds: ['notes-biology'],
    requiredContent: ['mitochondria'],
  },

  // ==========================================================================
  // CROSS-DOMAIN QUERIES - Multiple relevant sources
  // ==========================================================================
  {
    id: 'cross-databases',
    query: 'What databases have I used?',
    description: 'Spans work experience and system design notes',
    relevantDocIds: ['resume-axiom', 'resume-startup', 'notes-system-design'],
  },
  {
    id: 'cross-typescript',
    query: 'Where have I used TypeScript?',
    description: 'Technology across multiple contexts',
    relevantDocIds: ['resume-axiom'],
  },
  {
    id: 'cross-redis',
    query: 'Tell me about Redis usage',
    description: 'Redis in work experience and system design',
    relevantDocIds: ['resume-startup', 'notes-system-design'],
  },

  // ==========================================================================
  // DISAMBIGUATION QUERIES - Correct doc should outrank keyword-similar doc
  // ==========================================================================
  {
    id: 'disambig-axiom-math',
    query: 'What is an axiom in mathematics?',
    description: 'Should rank math notes ABOVE Axiom company resume',
    relevantDocIds: ['notes-math-axioms'],
    shouldNotMatchDocIds: ['resume-axiom'], // Should rank lower than math doc
    requiredContent: ['axiom', 'proof'],
  },

  // ==========================================================================
  // HARD NEGATIVES - Should NOT match despite keyword overlap
  // ==========================================================================
  {
    id: 'negative-python-snake',
    query: 'How do I care for a python snake?',
    description: 'Python the animal, not the language',
    relevantDocIds: [],
    shouldNotMatchDocIds: ['resume-startup'], // Has Python the language
  },
  {
    id: 'negative-cell-phone',
    query: 'Best cell phone plans',
    description: '"Cell" keyword but not biology',
    relevantDocIds: [],
    shouldNotMatchDocIds: ['notes-biology'], // Has "cell" in cellular biology
  },
  {
    id: 'negative-cooking',
    query: 'How do I make pasta?',
    description: 'Completely unrelated topic',
    relevantDocIds: [],
    shouldNotMatchDocIds: [], // Nothing should match at all
  },
  {
    id: 'negative-clickhouse-restaurant',
    query: 'ClickHouse restaurant reviews in NYC',
    description: 'ClickHouse keyword but restaurant context',
    relevantDocIds: [],
    shouldNotMatchDocIds: ['resume-axiom', 'notes-system-design'], // Have ClickHouse references
  },
  {
    id: 'negative-stripe-pattern',
    query: 'How to sew stripe patterns on fabric?',
    description: 'Stripe keyword but sewing context',
    relevantDocIds: [],
    shouldNotMatchDocIds: ['resume-startup'], // Has Stripe payment integration
  },

  // ==========================================================================
  // EDGE CASES - Boundary conditions
  // ==========================================================================
  {
    id: 'edge-single-word',
    query: 'mentoring',
    description: 'Single word query',
    relevantDocIds: ['resume-axiom', 'notes-semantic-only'],
  },
  {
    id: 'edge-long-query',
    query: 'I want to understand the detailed process of how cellular respiration converts glucose into ATP energy in the mitochondria',
    description: 'Very long query - should still find biology notes',
    relevantDocIds: ['notes-biology'],
  },
  {
    id: 'edge-typo-resilience',
    query: 'What is celluar respration?',
    description: 'Query with typos - embeddings may handle this',
    relevantDocIds: ['notes-biology'],
  },
  {
    id: 'edge-question-vs-statement',
    query: 'machine learning algorithms',
    description: 'Statement not question - should still match',
    relevantDocIds: ['notes-ml-basics'],
  },
];
