/**
 * Pure helper for highlighting evidence words in natural language queries (§9.3).
 * Supports case-insensitivity, overlap merging, and unicode/Devanagari safety.
 */

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export interface Range {
  start: number;
  end: number;
}

/**
 * Merges overlapping and adjacent ranges [start, end).
 */
export function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];

  let current = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start <= current.end) {
      // Overlapping or touching
      current = {
        start: current.start,
        end: Math.max(current.end, next.end),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Finds all occurrences of substrings in text (case-insensitive) and returns merged ranges.
 */
export function findEvidenceRanges(text: string, evidenceList: (string | undefined | null)[]): Range[] {
  if (!text || evidenceList.length === 0) return [];

  const lowerText = text.toLowerCase();
  const rawRanges: Range[] = [];

  for (const rawSnippet of evidenceList) {
    if (!rawSnippet) continue;
    const snippet = rawSnippet.trim();
    if (!snippet) continue;

    const lowerSnippet = snippet.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(lowerSnippet, searchFrom);
      if (idx === -1) break;
      rawRanges.push({ start: idx, end: idx + snippet.length });
      searchFrom = idx + Math.max(1, lowerSnippet.length);
    }
  }

  return mergeRanges(rawRanges);
}

/**
 * Segments a query text into highlighted and plain segments based on evidence snippets.
 */
export function highlightEvidence(
  text: string,
  evidenceList: (string | undefined | null)[]
): HighlightSegment[] {
  if (!text) return [];
  const ranges = findEvidenceRanges(text, evidenceList);
  if (ranges.length === 0) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({
        text: text.slice(cursor, range.start),
        highlighted: false,
      });
    }
    if (range.end > range.start) {
      segments.push({
        text: text.slice(range.start, range.end),
        highlighted: true,
      });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      highlighted: false,
    });
  }

  return segments;
}
