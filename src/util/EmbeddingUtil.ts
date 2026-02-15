export const EmbeddingUtil = {
  toPgVectorLiteral(vec: number[]): string {
    // pgvector accepts: '[1,2,3]'
    return `[${vec.join(',')}]`;
  },
};
