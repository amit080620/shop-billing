"use client";

import type { OCRResult, OCRWord } from "./types";

/** Tesseract's Page Segmentation Mode controls how it expects text to
 * be laid out on the page — this is a genuine, well-documented lever
 * for OCR accuracy that costs nothing extra to use, and was previously
 * left at Tesseract's default (PSM 3, "fully automatic"), which is
 * tuned for a full structured page like a scanned book, not a
 * photographed receipt or menu. */
export const PSM = {
  /** A single column of text of variable sizes — the best fit for a
   * typical receipt: one narrow strip of left-aligned lines. */
  SINGLE_COLUMN: "4",
  /** One uniform block of text — a safe general-purpose default when
   * the layout isn't known ahead of time. */
  SINGLE_BLOCK: "6",
  /** Sparse text with no particular reading order — genuinely the
   * best fit for a menu photo, where items may be scattered across
   * multiple columns or boxed sections rather than one clean list. */
  SPARSE_TEXT: "11",
} as const;

/** Runs OCR on an image entirely in the browser via Tesseract.js — no
 * paid API, no image upload to any external service. Tesseract's own
 * language-data download (~2-4MB, cached by the browser after first
 * use) is the only network activity, and it's a one-time download from
 * Tesseract's own CDN, not a per-scan cost. */
export async function runOCR(
  image: Blob,
  onProgress?: (status: string, progress: number) => void,
  psm: string = PSM.SINGLE_BLOCK,
): Promise<OCRResult> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (onProgress && m.status) onProgress(m.status, m.progress ?? 0);
    },
  });

  try {
    // Genuine accuracy lever: match the page-segmentation mode to how
    // this specific document is actually laid out, rather than
    // leaving Tesseract to guess with its general-purpose default.
    await worker.setParameters({ tessedit_pageseg_mode: psm as never });

    const { data } = await worker.recognize(image);

    const words: OCRWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const w of line.words ?? []) {
            words.push({
              text: w.text,
              confidence: w.confidence,
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            });
          }
        }
      }
    }

    return { rawText: data.text, words };
  } finally {
    await worker.terminate();
  }
}
