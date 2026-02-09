import type { AgentState } from '../../schemas/types';
import { extractMemories } from '../../memory/extractMemories';
import { SQLMemoryStore } from '../../memory/sql/SqlMemoryStore';
import { getUserId } from '../../config';

export const extractAndAddMemory = async (state: AgentState) => {
  const extractedMemories = (await extractMemories(state.userQuery)).filter(
    (item) => item.worth_keeping
  );

  let added = 0;
  let skipped = 0;
  const userId = getUserId();

  for (const mem of extractedMemories) {
    const memory = {
      user_id: userId,
      type: mem.type,
      confidence: mem.confidence,
      content: mem.content,
      created_at: new Date().toISOString(),
    };
    const result = await SQLMemoryStore.addMemory(memory);
    if (result) {
      added++;
    } else {
      skipped++;
    }
  }

  if (added > 0 || skipped > 0) {
    console.log(`[Memory] Added: ${added}, Skipped (duplicates): ${skipped}`);
  }

  return {};
};
