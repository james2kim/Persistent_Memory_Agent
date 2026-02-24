export const TEST_USER_ID = 'test-user-memory-eval';

/**
 * Test memories for retrieval evaluation.
 *
 * Design principles:
 * - Covers all memory types (preference, fact, goal, decision, summary)
 * - Different confidence levels for testing filters
 * - Different ages for testing temporal relevance
 * - Some overlap for testing ranking
 */

export interface TestMemory {
  id: string;
  type: 'preference' | 'goal' | 'fact' | 'decision' | 'summary';
  content: string;
  confidence: number;
  // Days ago (0 = today, negative = future for testing edge cases)
  daysAgo: number;
  // Expected queries that should retrieve this memory
  expectedQueries: string[];
}

export const TEST_MEMORIES: TestMemory[] = [
  // ============================================================================
  // PREFERENCES - No expiration
  // ============================================================================
  {
    id: 'pref-learning-style',
    type: 'preference',
    content: 'User prefers visual learning with diagrams and flowcharts over text-heavy explanations.',
    confidence: 0.95,
    daysAgo: 30,
    expectedQueries: ['How do I like to learn?', 'learning style', 'visual learning'],
  },
  {
    id: 'pref-communication',
    type: 'preference',
    content: 'User prefers concise, bullet-point summaries rather than long paragraphs.',
    confidence: 0.9,
    daysAgo: 60,
    expectedQueries: ['How should I format responses?', 'communication preference'],
  },
  {
    id: 'pref-study-time',
    type: 'preference',
    content: 'User studies best in the morning between 6am and 10am, prefers short 25-minute sessions.',
    confidence: 0.85,
    daysAgo: 45,
    expectedQueries: ['When do I study best?', 'study schedule', 'pomodoro'],
  },

  // ============================================================================
  // FACTS - No expiration
  // ============================================================================
  {
    id: 'fact-major',
    type: 'fact',
    content: 'User is a Computer Science major at Stanford University, graduating in 2025.',
    confidence: 0.98,
    daysAgo: 90,
    expectedQueries: ['What is my major?', 'where do I go to school?', 'Stanford'],
  },
  {
    id: 'fact-programming',
    type: 'fact',
    content: 'User has 3 years of Python experience and 2 years of JavaScript experience.',
    confidence: 0.92,
    daysAgo: 60,
    expectedQueries: ['What programming languages do I know?', 'Python experience'],
  },
  {
    id: 'fact-interests',
    type: 'fact',
    content: 'User is interested in machine learning, particularly natural language processing and transformers.',
    confidence: 0.88,
    daysAgo: 30,
    expectedQueries: ['What am I interested in?', 'machine learning interests', 'NLP'],
  },

  // ============================================================================
  // GOALS - 90 day expiration
  // ============================================================================
  {
    id: 'goal-recent',
    type: 'goal',
    content: 'User wants to complete the machine learning course by end of month and build a RAG application.',
    confidence: 0.9,
    daysAgo: 10,
    expectedQueries: ['What are my goals?', 'what am I working towards?', 'RAG project'],
  },
  {
    id: 'goal-medium',
    type: 'goal',
    content: 'User aims to improve system design skills for upcoming technical interviews.',
    confidence: 0.85,
    daysAgo: 45,
    expectedQueries: ['interview preparation', 'system design goals'],
  },
  {
    id: 'goal-expired',
    type: 'goal',
    content: 'User planned to finish reading the algorithms textbook by last semester.',
    confidence: 0.8,
    daysAgo: 100, // Should be filtered out (> 90 days)
    expectedQueries: [], // Should not be retrieved
  },

  // ============================================================================
  // DECISIONS - 30 day expiration
  // ============================================================================
  {
    id: 'decision-recent',
    type: 'decision',
    content: 'User decided to focus on backend development rather than frontend for the next project.',
    confidence: 0.88,
    daysAgo: 7,
    expectedQueries: ['What did I decide about the project?', 'backend vs frontend'],
  },
  {
    id: 'decision-expired',
    type: 'decision',
    content: 'User chose to use PostgreSQL over MongoDB for the database.',
    confidence: 0.9,
    daysAgo: 45, // Should be filtered out (> 30 days)
    expectedQueries: [], // Should not be retrieved
  },

  // ============================================================================
  // SUMMARIES - 90 day expiration
  // ============================================================================
  {
    id: 'summary-recent',
    type: 'summary',
    content: 'Last session covered supervised learning basics: linear regression, classification, and decision trees.',
    confidence: 0.92,
    daysAgo: 3,
    expectedQueries: ['What did we cover last time?', 'supervised learning review'],
  },
  {
    id: 'summary-week',
    type: 'summary',
    content: 'This week user studied RAG architecture, embedding models, and hybrid search techniques.',
    confidence: 0.88,
    daysAgo: 7,
    expectedQueries: ['What did I study this week?', 'RAG notes'],
  },

  // ============================================================================
  // LOW CONFIDENCE - Should be filtered
  // ============================================================================
  {
    id: 'low-conf-uncertain',
    type: 'fact',
    content: 'User might be interested in quantum computing but expressed uncertainty.',
    confidence: 0.4, // Below 0.6 threshold
    daysAgo: 10,
    expectedQueries: [], // Should not be retrieved due to low confidence
  },
  {
    id: 'low-conf-maybe',
    type: 'preference',
    content: 'User possibly prefers dark mode but has not confirmed.',
    confidence: 0.55, // Below 0.6 threshold
    daysAgo: 5,
    expectedQueries: [], // Should not be retrieved due to low confidence
  },
];

/**
 * Test queries with expected memory matches.
 * Used for retrieval evaluation.
 */
export interface TestMemoryQuery {
  id: string;
  query: string;
  description: string;
  // Memory IDs that should be retrieved
  relevantMemoryIds: string[];
  // Memory types to filter by (optional)
  allowedTypes?: ('preference' | 'goal' | 'fact' | 'decision' | 'summary')[];
  // Memory IDs that should NOT be retrieved
  shouldNotMatchMemoryIds?: string[];
}

export const TEST_MEMORY_QUERIES: TestMemoryQuery[] = [
  // ==========================================================================
  // PREFERENCE QUERIES
  // ==========================================================================
  {
    id: 'pref-query-learning',
    query: 'How do I prefer to learn new concepts?',
    description: 'Should retrieve learning style preference',
    relevantMemoryIds: ['pref-learning-style'],
    allowedTypes: ['preference'],
  },
  {
    id: 'pref-query-all',
    query: 'What are my preferences?',
    description: 'Should retrieve all active preferences',
    relevantMemoryIds: ['pref-learning-style', 'pref-communication', 'pref-study-time'],
    allowedTypes: ['preference'],
  },

  // ==========================================================================
  // FACT QUERIES
  // ==========================================================================
  {
    id: 'fact-query-background',
    query: 'Tell me about my educational background',
    description: 'Should retrieve school/major facts',
    relevantMemoryIds: ['fact-major'],
    allowedTypes: ['fact'],
  },
  {
    id: 'fact-query-skills',
    query: 'What programming skills do I have?',
    description: 'Should retrieve programming experience',
    relevantMemoryIds: ['fact-programming'],
    allowedTypes: ['fact'],
  },

  // ==========================================================================
  // GOAL QUERIES
  // ==========================================================================
  {
    id: 'goal-query-current',
    query: 'What are my current goals?',
    description: 'Should retrieve recent goals, not expired ones',
    relevantMemoryIds: ['goal-recent', 'goal-medium'],
    shouldNotMatchMemoryIds: ['goal-expired'],
    allowedTypes: ['goal'],
  },

  // ==========================================================================
  // CROSS-TYPE QUERIES
  // ==========================================================================
  {
    id: 'cross-ml-interest',
    query: 'What do I know about machine learning?',
    description: 'Should retrieve ML-related memories across types',
    relevantMemoryIds: ['fact-interests', 'goal-recent', 'summary-recent'],
  },
  {
    id: 'cross-study',
    query: 'Tell me about my study habits and progress',
    description: 'Should retrieve study-related memories',
    relevantMemoryIds: ['pref-study-time', 'summary-recent', 'summary-week'],
  },

  // ==========================================================================
  // FILTER TESTS
  // ==========================================================================
  {
    id: 'filter-low-confidence',
    query: 'quantum computing interests',
    description: 'Should NOT retrieve low confidence memory',
    relevantMemoryIds: [],
    shouldNotMatchMemoryIds: ['low-conf-uncertain'],
  },
  {
    id: 'filter-expired-decision',
    query: 'database decisions',
    description: 'Should NOT retrieve expired decision',
    relevantMemoryIds: [],
    shouldNotMatchMemoryIds: ['decision-expired'],
  },
];
