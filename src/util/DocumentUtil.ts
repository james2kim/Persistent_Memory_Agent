import { type RawChunk } from '../schemas/types';

export const DocumentUtil = {
  estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  },
  chunkText(
    text: string,
    opts?: { maxTokensPerChunk?: number; overlapTokens?: number; maxChunks?: number }
  ): RawChunk[] {
    const MAX_TOKENS = opts?.maxTokensPerChunk ?? 1000;
    const OVERLAP_TOKENS = opts?.overlapTokens ?? 150;
    const MAX_CHUNKS = opts?.maxChunks ?? 10_000; // ingestion default: “basically unlimited”

    const estTokens = (s: string) => this.estimateTokens(s);
    const overlapChars = OVERLAP_TOKENS * 4;
    const maxCharsPerChunk = MAX_TOKENS * 4;

    const out: RawChunk[] = [];
    let chunkIndex = 0;

    const pushChunk = (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      out.push({
        chunkIndex: chunkIndex++,
        content: trimmed,
        tokenCount: estTokens(trimmed),
      });
    };

    // fast path
    if (estTokens(text) <= MAX_TOKENS) {
      pushChunk(text);
      return out;
    }

    const paragraphs = text.split(/\n\n+/);
    let current = '';

    for (const p of paragraphs) {
      const paragraph = p.trim();
      if (!paragraph) continue;

      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

      if (estTokens(candidate) <= MAX_TOKENS) {
        current = candidate;
        continue;
      }

      // current is full; flush it (with overlap)
      if (current.trim()) {
        const flushed = current;
        pushChunk(flushed);
        if (out.length >= MAX_CHUNKS) break;

        // seed overlap
        current = flushed.slice(Math.max(0, flushed.length - overlapChars)).trim();
      }

      // paragraph itself might still be too big => split
      if (estTokens(paragraph) > MAX_TOKENS) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          const sentence = s.trim();
          if (!sentence) continue;

          const cand2 = current ? `${current} ${sentence}` : sentence;

          if (estTokens(cand2) <= MAX_TOKENS) {
            current = cand2;
            continue;
          }

          // flush current
          if (current.trim()) {
            const flushed2 = current;
            pushChunk(flushed2);
            if (out.length >= MAX_CHUNKS) break;
            current = flushed2.slice(Math.max(0, flushed2.length - overlapChars)).trim();
          }

          // sentence too big => force split by chars
          if (estTokens(sentence) > MAX_TOKENS) {
            for (let i = 0; i < sentence.length; i += maxCharsPerChunk) {
              pushChunk(sentence.slice(i, i + maxCharsPerChunk));
              if (out.length >= MAX_CHUNKS) break;
            }
            current = '';
          } else {
            current = sentence;
          }

          if (out.length >= MAX_CHUNKS) break;
        }
      } else {
        current = paragraph;
      }

      if (out.length >= MAX_CHUNKS) break;
    }

    if (current.trim() && out.length < MAX_CHUNKS) pushChunk(current);

    return out;
  },
};
