"use client";

/** Detects and corrects small rotation (skew) in a photographed
 * document — the projection-profile method, a classic offline
 * document-processing technique (no AI/network call). When text lines
 * are genuinely horizontal, summing dark pixels per row produces a
 * sharply peaked profile (rows of text alternate with clean gaps
 * between lines). At the wrong angle, that same text smears across
 * multiple rows, flattening the profile. The angle that maximizes the
 * profile's variance is genuinely the correct deskew angle. */

const MAX_SKEW_DEGREES = 12;
const ANGLE_STEP = 0.5;
const DETECTION_SIZE = 500; // small working copy — skew is a coarse, low-frequency property

function toGrayscaleBinary(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8Array {
  const { data } = ctx.getImageData(0, 0, width, height);
  const out = new Uint8Array(width * height);
  let sum = 0;
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    const g = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    out[i] = g;
    sum += g;
  }
  const mean = sum / out.length;
  // Simple global threshold is fine here — this working copy only
  // needs to distinguish "text-ish dark pixel" from "background" well
  // enough to profile row density, not produce a final clean image.
  for (let i = 0; i < out.length; i++) out[i] = out[i] < mean ? 1 : 0;
  return out;
}

function projectionVariance(binary: Uint8Array, width: number, height: number): number {
  const rowSums = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) sum += binary[base + x];
    rowSums[y] = sum;
  }
  let mean = 0;
  for (let y = 0; y < height; y++) mean += rowSums[y];
  mean /= height;
  let variance = 0;
  for (let y = 0; y < height; y++) {
    const d = rowSums[y] - mean;
    variance += d * d;
  }
  return variance / height;
}

/** Returns the detected skew angle in degrees (positive = rotated
 * clockwise, so the correction rotates by the negative of this). */
export async function detectSkewAngle(image: Blob): Promise<number> {
  const bitmap = await createImageBitmap(image);
  const scale = DETECTION_SIZE / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return 0;
  }

  let bestAngle = 0;
  let bestVariance = -Infinity;

  for (let angle = -MAX_SKEW_DEGREES; angle <= MAX_SKEW_DEGREES; angle += ANGLE_STEP) {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
    ctx.restore();

    const binary = toGrayscaleBinary(ctx, width, height);
    const variance = projectionVariance(binary, width, height);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = angle;
    }
  }

  bitmap.close();
  return bestAngle;
}

/** Rotates the full image by -angle degrees to straighten it. Applied
 * to the actual image being processed (not the small detection copy),
 * so the corrected image keeps its full quality for OCR. */
export async function rotateImage(image: Blob, angleDegrees: number): Promise<Blob> {
  if (Math.abs(angleDegrees) < 0.25) return image; // not worth the extra encode/decode

  const bitmap = await createImageBitmap(image);
  const radians = (-angleDegrees * Math.PI) / 180;

  // A rotated rectangle needs a slightly larger canvas to avoid
  // clipping its corners — standard bounding-box math for a rotation.
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const newWidth = Math.round(bitmap.width * cos + bitmap.height * sin);
  const newHeight = Math.round(bitmap.width * sin + bitmap.height * cos);

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return image;
  }

  // Fill with white first — the rotated corners would otherwise be
  // transparent, which Tesseract could misread as dark content.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, newWidth, newHeight);
  ctx.translate(newWidth / 2, newHeight / 2);
  ctx.rotate(radians);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? image), "image/jpeg", 0.92);
  });
}

/** Convenience wrapper — detect and correct in one call. */
export async function deskewImage(image: Blob): Promise<Blob> {
  const angle = await detectSkewAngle(image);
  return rotateImage(image, angle);
}
