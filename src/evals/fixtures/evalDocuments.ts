/**
 * Test documents for evaluation suite.
 *
 * These documents contain fake data that matches the expected
 * assertions in the eval dataset (src/evals/dataset.ts).
 *
 * Run `npx tsx src/evals/seed.ts` to ingest these before running evals.
 */

export const EVAL_USER_ID = 'eval-test-user';

export interface EvalDocument {
  id: string;
  title: string;
  source: string;
  content: string;
}

export const EVAL_DOCUMENTS: EvalDocument[] = [
  // ============================================================================
  // USER PROFILE - Matches personal queries in dataset (fake data)
  // ============================================================================
  {
    id: 'user-profile',
    title: 'User Profile',
    source: 'user_profile.md',
    content: `# User Profile - Alex Chen

## Career Information

**Current Goal:** Become a machine learning engineer specializing in NLP systems.

**Preferred Programming Language:** Python - loves the ML ecosystem and readability.

## Work History

- **2022 - Present:** DataFlow Inc - ML Engineer
- **2021:** Sunrise Labs - Backend Developer
- **2020:** Started learning programming

## Financial Notes

Severance package from previous role: $42,500 (received in 2022)

## Preferences

- Prefers notebooks for experimentation
- Likes test-driven development
- Studies research papers on weekends`,
  },

  // ============================================================================
  // STUDY CONTENT - Matches study_content queries in dataset
  // ============================================================================
  {
    id: 'lost-in-middle',
    title: 'Lost_in_middle.pdf',
    source: 'lost_in_middle.pdf',
    content: `# Lost in the Middle: How Language Models Use Long Contexts

## Summary

This paper investigates how language models handle information placed at different positions within long contexts.

## Key Findings

### Position Effects

Language models exhibit strong **primacy and recency bias** - they attend most to information at the beginning and end of the context, while information in the middle receives less attention.

### Performance Degradation

When relevant information is placed in the middle of a long context, model performance significantly degrades. This is due to attention patterns that favor the edges of the context window.

### Recommendations

1. Place important instructions near the **beginning or end** of the prompt
2. Use clear delimiters to separate different sections
3. Structure prompts with instructions first, then context (or context then instructions)
4. Avoid mixing instructions with evidence in the middle

## Implications for RAG Systems

When injecting retrieved context, place the most relevant chunks at the beginning or end, not buried in the middle.`,
  },

  {
    id: 'react-paper',
    title: 'ReAct Paper',
    source: 'react_paper.pdf',
    content: `# ReAct: Synergizing Reasoning and Acting in Language Models

## Overview

ReAct is a paradigm that combines **reasoning** and **acting** in language models to solve complex tasks.

## How It Works

The ReAct framework interleaves:

1. **Reasoning traces** - The model thinks through the problem step by step
2. **Actions** - The model takes actions like calling a tool or API
3. **Observations** - The model receives feedback from the environment

## Example Pattern

Thought: I need to find information about X
Action: search[X]
Observation: [Results from search]
Thought: Based on these results, I can conclude...
Action: finish[answer]

## Benefits

- More interpretable than pure acting
- Better at complex multi-step reasoning
- Can use external tools effectively
- Reduces hallucination through grounding in observations

## Comparison to Other Methods

- **Chain-of-Thought (CoT):** Reasoning only, no actions
- **Act-only:** Actions without explicit reasoning
- **ReAct:** Combines both for better performance`,
  },

  {
    id: 'react-library',
    title: 'React Documentation',
    source: 'react_docs.md',
    content: `# React - JavaScript Library for User Interfaces

## What is React?

React is a **JavaScript library** for building **user interfaces**. It was developed by **Facebook** (now **Meta**) and is maintained as an open-source project.

## Core Concepts

### Component-Based Architecture

React uses a **component-based** approach where UIs are built from independent, reusable pieces. Each component manages its own state and can be composed to create complex interfaces.

### Virtual DOM

React uses a virtual DOM to efficiently update the browser's actual DOM, minimizing expensive DOM operations.

### Declarative Syntax

You describe what the UI should look like, and React handles the how.

## Example Component

function Welcome({ name }) {
  return <h1>Hello, {name}</h1>;
}

## Ecosystem

- React Router for navigation
- Redux/Context for state management
- Next.js for server-side rendering`,
  },

  {
    id: 'hair-loss',
    title: 'Hair Loss Treatments',
    source: 'hair_loss_treatments.md',
    content: `# Hair Loss Treatments: Finasteride vs Dutasteride

## Overview

Both finasteride and dutasteride are 5-alpha reductase inhibitors used to treat hair loss.

## Comparison

### Efficacy

**Dutasteride is more effective** than finasteride for hair regrowth in clinical studies. Dutasteride inhibits both Type I and Type II 5-alpha reductase, while finasteride only inhibits Type II.

Studies show dutasteride can **outperform** finasteride in:
- Hair count increase
- Hair thickness improvement
- Overall regrowth outcomes

### Mechanism

- **Finasteride:** Blocks ~70% of DHT production
- **Dutasteride:** Blocks ~90% of DHT production (superior DHT suppression)

### Considerations

While dutasteride shows superior efficacy, the choice depends on individual factors:
- Side effect tolerance
- Cost considerations
- Availability (dutasteride is off-label for hair loss in some countries)

## Conclusion

For maximum efficacy, dutasteride is generally considered more effective, though finasteride remains the more commonly prescribed first-line treatment.`,
  },
];
