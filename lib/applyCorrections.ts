import { similarity } from "./fuzzyMatch";
import type { OcrCorrection } from "./actions/ocrCorrections";

/** Applies this shop's remembered corrections to a freshly-scanned
 * name. Exact match (case-insensitive) first — the common case, the
 * scan misread the exact same way as before. Falls back to a fuzzy
 * match (similarity > 0.85) so a slightly-different-but-clearly-the-
 * same misread ("Besmati Rice" vs a remembered "Besmatti Rice") still
 * gets caught, without being loose enough to correct something
 * genuinely different. Returns the name unchanged if nothing matches
 * — this never invents a correction, only reuses ones the shop
 * actually taught it. */
export function applyCorrections(name: string, corrections: OcrCorrection[]): string {
  const trimmed = name.trim();
  if (!trimmed || corrections.length === 0) return name;

  const lower = trimmed.toLowerCase();
  const exact = corrections.find((c) => c.wrong.toLowerCase() === lower);
  if (exact) return exact.correct;

  let best: { correction: OcrCorrection; score: number } | null = null;
  for (const c of corrections) {
    const score = similarity(trimmed, c.wrong);
    if (score > 0.85 && (!best || score > best.score)) best = { correction: c, score };
  }
  return best ? best.correction.correct : name;
}
