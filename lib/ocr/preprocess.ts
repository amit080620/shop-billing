"use client";

import { deskewImage } from "./deskew";
import { adaptiveNormalize } from "./adaptiveNormalize";

/** Downscales very large phone-camera photos to a sane max dimension —
 * Tesseract doesn't need 12-megapixel input, and a smaller image
 * processes noticeably faster on a mid-range phone. */
const MAX_DIMENSION = 1600;

/** Runs the whole preprocessing pipeline (deskew → resize → adaptive
 * lighting correction) on a captured/uploaded image and returns a new
 * Blob ready for OCR. Everything happens in the browser via Canvas —
 * the image never leaves the device. Deskew runs first, on the
 * original full-resolution photo, since rotation detail is genuinely
 * sharpest there; resizing and lighting correction follow. */
export async function preprocessImage(file: File | Blob): Promise<Blob> {
  const straightened = await deskewImage(file);

  const bitmap = await createImageBitmap(straightened);

  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return straightened;

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const resized: Blob = await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? straightened), "image/jpeg", 0.95);
  });

  // Adaptive local-contrast normalization — flattens uneven lighting
  // (a shadow across one side of a receipt) while genuinely skipping
  // itself when the photo's lighting is already even, so this is a
  // strict improvement over the old flat global stretch rather than a
  // behavior change on photos that didn't need correcting.
  return adaptiveNormalize(resized);
}
