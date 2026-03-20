import { tool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { haikuModel } from '../agent/constants';
import { withRetry } from '../util/RetryUtil';
import { REGISTERED_TOOLS } from '../workflows/registry';
import type { AIMessageChunk } from '@langchain/core/messages';

/**
 * Converts registered workflow tools into LangChain tool definitions
 * for Anthropic's native tool_use API.
 */
const langchainTools = REGISTERED_TOOLS.map((wfTool) =>
  tool(
    // The function is a no-op — we only need the LLM to decide IF to call it.
    // Actual execution happens in executeWorkflow via the existing pipeline.
    async (input) => JSON.stringify(input),
    {
      name: wfTool.name,
      description: wfTool.description,
      schema: z.object({
        topic: z.string().describe('The topic or subject the user wants to study'),
      }),
    }
  )
);

const TOOL_SELECTION_PROMPT = `You are a study assistant that can help students learn.

You have access to tools that can CREATE study materials. Use a tool ONLY when the user explicitly asks you to create, generate, or make something (e.g., "make me a quiz", "create flashcards").

For all other queries — questions, explanations, greetings, personal questions — do NOT use any tool. Instead, respond with a brief classification of the query type.

IMPORTANT: Only call a tool if the user's intent is clearly to CREATE or GENERATE study materials. Asking ABOUT a topic is NOT a tool call.`;

const modelWithTools = haikuModel.bindTools(langchainTools);

export interface ToolSelectionResult {
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
}

/**
 * Uses the LLM with bound tools to decide whether to invoke a workflow tool.
 * Returns the tool name and args if a tool was selected, null otherwise.
 */
export const selectTool = async (query: string): Promise<ToolSelectionResult> => {
  try {
    const response = await withRetry(
      () =>
        modelWithTools.invoke([
          { role: 'system', content: TOOL_SELECTION_PROMPT },
          { role: 'user', content: query },
        ]),
      { label: 'toolSelector' }
    ) as AIMessageChunk;

    // Check if the LLM decided to call a tool
    const toolCalls = response.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const selected = toolCalls[0];
      console.log(`[toolSelector] LLM selected tool: ${selected.name}`, selected.args);
      return {
        toolName: selected.name,
        toolArgs: selected.args as Record<string, unknown>,
      };
    }

    // No tool called — LLM decided to respond directly
    console.log('[toolSelector] LLM decided no tool needed');
    return { toolName: null, toolArgs: null };
  } catch (err) {
    console.warn('[toolSelector] Failed, assuming no tool:', err);
    return { toolName: null, toolArgs: null };
  }
};
