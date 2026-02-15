import type { AgentState } from '../../schemas/types';
import { extractMemories } from '../../memory/extractMemories';
import { MemoryStore } from '../../stores/MemoryStore';
import { getUserId } from '../../config';
import { defaultEmbedding } from '../../services/EmbeddingService';

export const extractAndAddMemory = async (state: AgentState) => {
  const extractedMemories = (await extractMemories(state.userQuery)).filter(
    (item) => item.worth_keeping
  );

  let added = 0;
  let skipped = 0;
  const userId = getUserId();

  for (const mem of extractedMemories) {
    const embedding = await defaultEmbedding.embedText(mem.content);
    const memory = {
      user_id: userId,
      type: mem.type,
      confidence: mem.confidence,
      content: mem.content,
      created_at: new Date().toISOString(),
      embedding,
    };
    const result = await MemoryStore.addMemory(memory, embedding);
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
