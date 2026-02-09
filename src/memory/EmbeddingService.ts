import { VoyageAIClient } from 'voyageai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export class EmbeddingService {
  private client: VoyageAIClient;
  private model: string;

  constructor() {
    this.client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY ?? '' });
    this.model = 'voyage-3.5-lite';
  }
  normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }

  async embedText(
    text: string,
    inputType: 'document' | 'query' = 'document'
  ): Promise<number[] | undefined> {
    const response = await this.client.embed({
      input: text,
      model: this.model,
      inputType: inputType,
    });
    const embedding = response.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error('Embedding failed');
    }
    return embedding;
  }
}

// Default instance for simple usage
export const defaultEmbedding = new EmbeddingService();
