import { haikuModel } from '../agent/constants';

/**
 * Extracts document title from content.
 * Tries multiple strategies, falls back to filename.
 */

// Words that indicate a title is truncated (incomplete)
const TRUNCATION_INDICATORS = [
  'versus', 'vs', 'and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'for',
  'with', 'to', 'from', 'by', 'as', 'at', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'over',
];

export const TitleExtractor = {
  /**
   * Check if a title appears to be truncated (ends with a preposition/conjunction).
   */
  isTruncated(title: string): boolean {
    const lastWord = title.trim().split(/\s+/).pop()?.toLowerCase();
    return lastWord ? TRUNCATION_INDICATORS.includes(lastWord) : false;
  },
  /**
   * Extract title using LLM (for PDFs and complex documents).
   * More accurate but costs an API call.
   */
  async extractTitleWithLLM(content: string, fallbackFilename: string): Promise<string> {
    try {
      // Only send first ~1000 chars to minimize tokens
      const snippet = content.slice(0, 1000);

      const response = await haikuModel.invoke([
        {
          role: 'system',
          content:
            'Extract the document title from the beginning of this text. Return ONLY the title, nothing else. If no clear title, return "NONE".',
        },
        { role: 'user', content: snippet },
      ]);

      const title =
        typeof response.content === 'string'
          ? response.content.trim()
          : String(response.content).trim();

      if (title && title !== 'NONE' && title.length > 3 && title.length < 200) {
        return title;
      }
    } catch {
      // Fall through to non-LLM extraction
    }

    return this.extractTitle(content, fallbackFilename);
  },

  /**
   * Extract title from document content.
   * Strategies (in order):
   * 1. Markdown heading (# Title)
   * 2. First line if it looks like a title
   * 3. Fallback to provided filename
   */
  extractTitle(content: string, fallbackFilename: string): string {
    const cleaned = content.trim();

    // Strategy 1: Markdown heading
    const markdownTitle = this.extractMarkdownHeading(cleaned);
    if (markdownTitle) return markdownTitle;

    // Strategy 2: First line if it looks like a title
    const firstLineTitle = this.extractFirstLineTitle(cleaned);
    if (firstLineTitle) return firstLineTitle;

    // Fallback: Use filename without extension
    return this.cleanFilename(fallbackFilename);
  },

  /**
   * Extract first markdown heading (# or ##)
   */
  extractMarkdownHeading(content: string): string | null {
    // Match # Heading or ## Heading at start of line
    const match = content.match(/^#{1,2}\s+(.+)$/m);
    if (match && match[1]) {
      const title = match[1].trim();
      // Validate it looks like a title (not too long, not a sentence)
      if (title.length > 3 && title.length < 150 && !title.endsWith('.')) {
        return title;
      }
    }
    return null;
  },

  /**
   * Extract first line if it looks like a title.
   * A title typically:
   * - Is short (< 100 chars)
   * - Doesn't end with punctuation (except ? for questions)
   * - Isn't a full sentence (no lowercase start after period)
   */
  extractFirstLineTitle(content: string): string | null {
    const firstLine = content.split('\n')[0]?.trim();
    if (!firstLine) return null;

    // Too long for a title
    if (firstLine.length > 100) return null;

    // Too short
    if (firstLine.length < 5) return null;

    // Looks like a sentence (ends with period, has multiple sentences)
    if (firstLine.endsWith('.') && firstLine.split('.').length > 2) return null;

    // Has paragraph-like characteristics
    if (firstLine.includes('. ') && firstLine.length > 50) return null;

    // Looks like metadata or code
    if (firstLine.startsWith('{') || firstLine.startsWith('<')) return null;

    // Likely a title - clean it up
    return firstLine.replace(/[.,:;]$/, '').trim();
  },

  /**
   * Clean filename to use as fallback title.
   * Removes extension and cleans up common patterns.
   */
  cleanFilename(filename: string): string {
    return filename
      .replace(/\.[^.]+$/, '') // Remove extension
      .replace(/[-_]/g, ' ')   // Replace dashes/underscores with spaces
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  },
};
