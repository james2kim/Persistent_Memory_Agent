import { tool } from 'langchain';
import { searchMemoriesInputSchema } from '../schemas/types';
import type { SearchMemoriesInput } from '../schemas/types';
import { MemoryUtil } from '../memory/MemoryUtil';
import { getUserId } from '../config';

export const searchMemoriesTool = tool(
  async (input: SearchMemoriesInput) => {
    console.log('toolCALL', input);
    const { queryText, options } = input;
    const user_id = getUserId();
    const result = await MemoryUtil.retrieveRelevantMemories(user_id, queryText, options);
    console.log('result', result);
    return result;
  },
  {
    name: 'searchMemoriesTool',
    description:
      'Use this tool when we need to search topK similar/relevant memories needed to better answer userQuery',
    schema: searchMemoriesInputSchema,
  }
);

export const TOOLS_BY_NAME = {
  searchMemoriesTool,
};

export const TOOLS_INPUT_SCHEMAS = {
  searchMemoriesTool: searchMemoriesInputSchema,
};
