"use client";

import type { OCRResult, OCRWord } from "./types";

/** Runs OCR on an image entirely in the browser via Tesseract.js — no
 * paid API, no image upload to any external service. Tesseract's own
 * language-data download (~2-4MB, cached by the browser after first
 * use) is the only network activity, and it's a one-time download from
 * Tesseract's own CDN, not a per-scan cost. */
export async function runOCR(
  image: Blob,
  onProgress?: (status: string, progress: number) => void,
): Promise<OCRResult> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (onProgress && m.status) onProgress(m.status, m.progress ?? 0);
    },
  });

  try {
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
