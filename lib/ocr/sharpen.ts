"use client";

/** A mild unsharp-style boost — a classic 3x3 sharpen kernel blended
 * at partial strength with the original, so an already-crisp photo
 * isn't pushed into noisy over-sharpening while a slightly soft one
 * genuinely gets cleaner edges for OCR to key off of. */
const KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0];
const BLEND = 0.6; // 0 = no effect, 1 = full kernel strength

export async function sharpenImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file instanceof Blob ? file : new Blob([file]);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;

      // Edge pixels (no full 3x3 neighborhood available) pass through
      // unchanged — not worth the special-case complexity for a
      // one-pixel border that OCR doesn't meaningfully depend on.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[outIdx] = src[outIdx];
        out[outIdx + 1] = src[outIdx + 1];
        out[outIdx + 2] = src[outIdx + 2];
        out[outIdx + 3] = src[outIdx + 3];
        continue;
      }

      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + channel;
            sum += src[idx] * KERNEL[k];
            k++;
          }
        }
        const original = src[outIdx + channel];
        out[outIdx + channel] = original * (1 - BLEND) + sum * BLEND;
      }
      out[outIdx + 3] = src[outIdx + 3];
    }
  }

  imageData.data.set(out);
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? (file instanceof Blob ? file : new Blob([file]))), "image/jpeg", 0.92);
  });
}
