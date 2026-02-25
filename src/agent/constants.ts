import { ChatAnthropic } from '@langchain/anthropic';

export const MAX_TOOL_ATTEMPTS = 3;
export const MAX_MESSAGES = 40; // Summarize + prune when reached
export const CONTEXT_WINDOW_MESSAGES = 20; // Messages to send to LLM (+ summary)

export const haikuModel = new ChatAnthropic({
  model: 'claude-3-haiku-20240307',
  apiKey: process.env.ANTHROPIC_API_KEY,
  clientOptions: {
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
  },
});

export const sonnetModel = new ChatAnthropic({
  model: 'claude-sonnet-4-5-20250929',
  apiKey: process.env.ANTHROPIC_API_KEY,
  clientOptions: {
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
  },
});
