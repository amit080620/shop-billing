"use client";

/** Downscales very large phone-camera photos to a sane max dimension —
 * Tesseract doesn't need 12-megapixel input, and a smaller image
 * processes noticeably faster on a mid-range phone. */
const MAX_DIMENSION = 1600;

/** Runs the whole preprocessing pipeline (resize → grayscale → contrast
 * boost) on a captured/uploaded image and returns a new Blob ready for
 * OCR. Everything happens in the browser via Canvas — the image never
 * leaves the device. */
export async function preprocessImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

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
  if (!ctx) return file instanceof Blob ? file : new Blob([file]);

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Grayscale + a simple contrast stretch — printed/thermal receipts
  // are near-monochrome already, so this mostly helps flatten uneven
  // lighting and phone-camera shadows rather than "enhancing" real
  // detail. Deliberately not a full binarization (hard black/white)
  // since that can lose thin thermal-printer strokes; Tesseract's own
  // internal binarization handles that step better than a fixed
  // browser-side threshold would.
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[i / 4] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const stretched = ((gray[i / 4] - min) / range) * 255;
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? (file instanceof Blob ? file : new Blob([file]))), "image/jpeg", 0.9);
  });
}
