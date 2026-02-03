import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ChatAnthropic } from '@langchain/anthropic';
import {summarizationSchema,} from './types';
import type {Message} from './types';

const model = new ChatAnthropic({
    model: "claude-sonnet-4-5-20250929",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

const SUMMARIZE_MESSAGES_SYSTEM_PROMPT = `You are a conversation summarizer for a persistent memory system. Your task is to extract and condense the most critical information from a conversation into a brief summary.

Focus ONLY on these essential elements:
1. DECISIONS - What was decided or agreed upon
2. CONSTRAINTS - Limitations, requirements, or boundaries established
3. USER GOALS - What the user is trying to accomplish
4. AGENT COMMITMENTS - What the agent promised or agreed to do
5. STATE CHANGES - Important changes to files, configurations, or system state

Rules:
- Be extremely concise (max 1200 characters)
- Omit greetings, pleasantries, and filler
- Use shorthand and abbreviations where clear
- Prioritize actionable information over context
- If nothing important was discussed, note "No significant state changes"
- If an existing summary is provided, MERGE it with new information from the conversation
- When merging, preserve all essential details from the existing summary and add new ones
- Remove duplicates and consolidate overlapping information
- The final summary must still fit within 1200 characters

Output your confidence (0-1) based on how much essential information was present in the combined summary.`

const modelWithMemoryStructure = model.withStructuredOutput(summarizationSchema)

export const summarizeMessages = async (existingSummary: string, messages: Message[]) => {
    const formattedMessages = messages.map(m => `[${m.role}]: ${m.content}`).join('\n')

    const existingSummarySection = existingSummary
        ? `\n\nEXISTING SUMMARY TO MERGE:\n${existingSummary}`
        : ''

    const response = await modelWithMemoryStructure.invoke([
        { role: "system", content: SUMMARIZE_MESSAGES_SYSTEM_PROMPT },
        { role: "user", content: `Summarize this conversation and merge with any existing summary:${existingSummarySection}\n\nNEW CONVERSATION:\n${formattedMessages}` }
    ])
    return response
}