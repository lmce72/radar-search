/**
 * Query-term proximity scoring.
 *
 * Ranking follows the useful part of Meilisearch's rule order: an exact phrase beats
 * terms that merely co-occur, and among co-occurring terms the smallest containing window
 * wins. This is deliberately a scoring tier, not a filter: the surrounding BM25 score
 * still decides between otherwise comparable documents.
 * 查询词邻近度评分：精确短语 > 同句相邻 > 同文共现；只影响排序，不做过滤。
 */

const MAX_OCCURRENCES_PER_TERM = 400;

function normalizedTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map(term => term.trim().toLowerCase()).filter(Boolean))];
}

interface Occurrence { start: number; end: number; term: number }

/**
 * Higher is more relevant. Returns:
 *   3000+  exact phrase present
 *   0-800  every term present; closer terms score higher
 *   0      at least one term missing
 */
export function proximityScore(text: string, terms: readonly string[]): number {
  const wanted = normalizedTerms(terms);
  if (!text || wanted.length === 0) return 0;
  const lower = text.toLowerCase();
  if (wanted.length === 1) return lower.includes(wanted[0]) ? 100 : 0;

  const phrase = wanted.join(' ').replace(/\s+/g, ' ');
  if (lower.replace(/\s+/g, ' ').includes(phrase)) return 3000 + wanted.length * 10;

  const occurrences: Occurrence[] = [];
  for (let termIndex = 0; termIndex < wanted.length; termIndex++) {
    const term = wanted[termIndex];
    let from = 0;
    let count = 0;
    while (count < MAX_OCCURRENCES_PER_TERM) {
      const at = lower.indexOf(term, from);
      if (at < 0) break;
      occurrences.push({start: at, end: at + term.length, term: termIndex});
      from = at + Math.max(1, term.length);
      count++;
    }
  }
  if (occurrences.length < wanted.length) return 0;
  occurrences.sort((a, b) => a.start - b.start);

  const counts = new Uint16Array(wanted.length);
  let found = 0;
  let left = 0;
  let bestSpan = Infinity;
  for (let right = 0; right < occurrences.length; right++) {
    const current = occurrences[right];
    if (counts[current.term] === 0) found++;
    counts[current.term]++;
    while (found === wanted.length) {
      const first = occurrences[left];
      const span = current.end - first.start;
      if (span < bestSpan) bestSpan = span;
      counts[first.term]--;
      if (counts[first.term] === 0) found--;
      left++;
    }
  }
  if (bestSpan === Infinity) return 0;
  const termChars = wanted.reduce((sum, term) => sum + term.length, 0);
  const gap = Math.max(0, bestSpan - termChars);
  return 800 / (1 + gap);
}

/** Snippet ordering also rewards partial coverage when no window contains every term. */
export function relevanceScore(text: string, terms: readonly string[]): number {
  const proximity = proximityScore(text, terms);
  if (proximity > 0) return proximity;
  const lower = text.toLowerCase();
  return normalizedTerms(terms).filter(term => lower.includes(term)).length * 5;
}
