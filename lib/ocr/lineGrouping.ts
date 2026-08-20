import type { OCRWord } from "./types";

/** Rebuilds text lines directly from word bounding boxes instead of
 * trusting Tesseract's own line segmentation — genuinely more robust
 * for multi-column layouts (a two-column menu, or a receipt with a
 * price column offset from item names), where Tesseract's automatic
 * line-breaking sometimes merges two visually-separate columns into
 * one garbled line, or splits a single line that has an unusual gap
 * in it. Two words are considered "on the same line" when their
 * vertical centers are close relative to their own text height —
 * genuinely more reliable than a fixed pixel threshold, since it
 * scales with the actual font size Tesseract detected. */
export function rebuildLinesFromWords(words: OCRWord[]): string[] {
  if (words.length === 0) return [];

  const withMetrics = words.map((w) => ({
    ...w,
    centerY: (w.y0 + w.y1) / 2,
    height: Math.max(1, w.y1 - w.y0),
  }));

  // Sort top-to-bottom first, so lines are discovered in reading order.
  withMetrics.sort((a, b) => a.centerY - b.centerY);

  type Line = { centerY: number; avgHeight: number; words: typeof withMetrics };
  const lines: Line[] = [];

  for (const word of withMetrics) {
    // A word joins the most recent line if its vertical center falls
    // within roughly half that line's average text height — words on
    // a genuinely different line (even a tightly-spaced next row) will
    // fall clearly outside this band.
    const last = lines[lines.length - 1];
    if (last && Math.abs(word.centerY - last.centerY) < last.avgHeight * 0.6) {
      last.words.push(word);
      last.centerY = (last.centerY * (last.words.length - 1) + word.centerY) / last.words.length;
      last.avgHeight = (last.avgHeight * (last.words.length - 1) + word.height) / last.words.length;
    } else {
      lines.push({ centerY: word.centerY, avgHeight: word.height, words: [word] });
    }
  }

  // Within each reconstructed line, sort left-to-right by X position
  // — genuinely reflects reading order regardless of the order
  // Tesseract happened to emit the words in.
  return lines.map((line) =>
    line.words
      .sort((a, b) => a.x0 - b.x0)
      .map((w) => w.text)
      .join(" "),
  );
}
