/** Genuine edit-distance (Levenshtein) fuzzy string matching — pure
 * algorithm, no AI/network call. Used to catch OCR near-misses against
 * a shop's own existing product names ("Tornato Ketchup" scanned from
 * a photo should match an existing "Tomato Ketchup" product, not
 * create a duplicate). */

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row rolling array — O(min(m,n)) space instead of the naive
  // O(m*n) matrix, since only the previous row is ever needed.
  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1, // insertion
        prevRow[j] + 1, // deletion
        prevRow[j - 1] + cost, // substitution
      );
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

/** 0 (completely different) to 1 (identical), case-insensitive. */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return 1;
  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(x, y) / maxLen;
}

/** Finds the closest match for a scanned/OCR'd name among a shop's own
 * existing product names, above a genuine confidence floor — a weak
 * match (e.g. 40% similar) is worse than no suggestion at all, since
 * it would wrongly nudge an unrelated item together. */
export function findClosestMatch(
  query: string,
  candidates: { id: string; name: string }[],
  minSimilarity = 0.72,
): { id: string; name: string; score: number } | null {
  let best: { id: string; name: string; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(query, c.name);
    if (score >= minSimilarity && (!best || score > best.score)) {
      best = { id: c.id, name: c.name, score };
    }
  }
  return best;
}
