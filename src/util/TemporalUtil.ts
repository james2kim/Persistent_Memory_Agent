/**
 * Utilities for extracting and filtering by temporal (year) ranges.
 */

export type TemporalRange = {
  start_year: number | null;
  end_year: number | null; // null = "Present" / ongoing
};

export const TemporalUtil = {
  /**
   * Extract all temporal ranges from a chunk of text.
   * Returns the broadest range found (min start_year, max end_year).
   */
  extractTemporalRange(text: string): TemporalRange {
    const years: number[] = [];
    let hasOngoing = false;

    // Match date ranges like "June 2022 – Present" or "May 2021 – May 2022"
    const rangePattern = /(\d{4})\s*[–\-—]\s*(Present|Current|Now|Ongoing|\d{4})/gi;
    let match;
    while ((match = rangePattern.exec(text)) !== null) {
      const startYear = parseInt(match[1], 10);
      years.push(startYear);

      const endPart = match[2];
      if (/present|current|now|ongoing/i.test(endPart)) {
        hasOngoing = true;
      } else {
        const endYear = parseInt(endPart, 10);
        years.push(endYear);
      }
    }

    // Also match standalone years
    const yearPattern = /\b(19|20)\d{2}\b/g;
    while ((match = yearPattern.exec(text)) !== null) {
      years.push(parseInt(match[0], 10));
    }

    if (years.length === 0) {
      return { start_year: null, end_year: null };
    }

    const minYear = Math.min(...years);
    const maxYear = hasOngoing ? null : Math.max(...years);

    return {
      start_year: minYear,
      end_year: maxYear,
    };
  },

  /**
   * Extract a year reference from a user query.
   * "what did I do in 2023" → 2023
   * "my work experience in 2024" → 2024
   */
  extractQueryYear(query: string): number | null {
    // Look for 4-digit years in 1900-2099 range
    const match = query.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : null;
  },

  /**
   * Check if a temporal range includes a specific year.
   * Handles "Present" (end_year = null) correctly.
   */
  rangeIncludesYear(
    range: TemporalRange,
    year: number,
    currentYear: number = new Date().getFullYear()
  ): boolean {
    if (range.start_year === null) return false;

    const start = range.start_year;
    const end = range.end_year ?? currentYear; // null = Present = current year

    return year >= start && year <= end;
  },
};
