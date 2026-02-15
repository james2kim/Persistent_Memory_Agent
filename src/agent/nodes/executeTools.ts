import { ToolMessage } from 'langchain';
import type { AgentState } from '../../schemas/types';
import { TOOLS_BY_NAME, TOOLS_INPUT_SCHEMAS } from '../../tools/tools';
import { OrchestrationUtil } from '../../util/OrchestrationUtil';

export const verifyAndExecuteToolIntent = async (state: AgentState) => {
  const toolMessages: ToolMessage[] = [];

  for (const toolCall of state.tool_calls ?? []) {
    const tool = TOOLS_BY_NAME[toolCall.name as keyof typeof TOOLS_BY_NAME];
    if (!tool) {
      const observation = {
        success: false,
        error_type: 'invalid_input',
        error_message: `Unknown Tool Name: ${toolCall.name}`,
      };
      toolMessages.push(
        new ToolMessage({
          content: JSON.stringify(observation),
          tool_call_id: toolCall.id,
        })
      );
      continue;
    }
    const schema = TOOLS_INPUT_SCHEMAS[toolCall.name as keyof typeof TOOLS_INPUT_SCHEMAS];

    const processedArgs = OrchestrationUtil.parseStringifiedJsonFields(toolCall.args);
    const parsed = schema.safeParse(processedArgs);
    if (!parsed.success) {
      const observation = {
        success: false,
        error_type: 'invalid_schema',
        error_message: `Schema type mismatch for tool: ${toolCall.name}`,
      };
      toolMessages.push(
        new ToolMessage({
          content: JSON.stringify(observation),
          tool_call_id: toolCall.id,
        })
      );
    }

    try {
      const toolResult = await (
        tool as {
          invoke: (input: Record<string, unknown>) => Promise<unknown>;
        }
      ).invoke(parsed.data as Record<string, unknown>);

      toolMessages.push(
        new ToolMessage({
          tool_call_id: toolCall.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        })
      );
    } catch (err) {
      const observation = {
        success: false,
        error_type: 'runtime_error',
        error_message: err instanceof Error ? err.message : 'Unknown runtime error',
      };
      toolMessages.push(
        new ToolMessage({
          content: JSON.stringify(observation),
          tool_call_id: toolCall.id,
        })
      );
    }
  }
  return {
    messages: toolMessages,
    tool_calls: undefined,
  };
};
