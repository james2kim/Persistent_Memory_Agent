import { ChatAnthropic } from '@langchain/anthropic';

export const MAX_TOOL_ATTEMPTS = 3;
export const MAX_MESSAGES = 40;

export const haikuModel = new ChatAnthropic({
  model: 'claude-3-haiku-20240307',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const sonnetModel = new ChatAnthropic({
  model: 'claude-sonnet-4-5-20250929',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
