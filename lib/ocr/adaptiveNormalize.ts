"use client";

/** Block size for local-background estimation — small enough to
 * follow a real lighting gradient across a receipt, large enough that
 * each block still contains a genuine mix of background and text
 * (not just a single letter's worth of pixels). */
const BLOCK_SIZE = 24;

/** Detects whether an image genuinely has uneven lighting worth
 * correcting — comparing block-mean brightness across the image. A
 * well and evenly lit photo doesn't need this extra pass; the existing
 * simple global contrast stretch already handles it fine, and running
 * adaptive normalization on an image that doesn't need it adds no
 * value for the extra compute. */
function hasUnevenLighting(blockMeans: Float64Array): boolean {
  let min = 255;
  let max = 0;
  for (const m of blockMeans) {
    if (m < min) min = m;
    if (m > max) max = m;
  }
  // A genuine shadow/gradient produces a wide spread between the
  // brightest and darkest regions of the page background — a evenly
  // lit photo's blocks stay much closer together than this.
  return max - min > 45;
}

/** Normalizes each pixel against its own local neighborhood's
 * brightness — flattens a shadow gradient across the page while
 * preserving the actual contrast of text strokes against their
 * immediate surroundings, which a single global threshold can't do
 * when one side of the photo is genuinely brighter than the other. */
export async function adaptiveNormalize(file: File | Blob): Promise<Blob> {
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
  const data = imageData.data;

  const blocksX = Math.ceil(width / BLOCK_SIZE);
  const blocksY = Math.ceil(height / BLOCK_SIZE);
  const blockMeans = new Float64Array(blocksX * blocksY);
  const blockCounts = new Float64Array(blocksX * blocksY);

  // Pass 1 — genuine local background estimate per block.
  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / BLOCK_SIZE);
    for (let x = 0; x < width; x++) {
      const bx = Math.floor(x / BLOCK_SIZE);
      const idx = (y * width + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const blockIdx = by * blocksX + bx;
      blockMeans[blockIdx] += gray;
      blockCounts[blockIdx] += 1;
    }
  }
  for (let i = 0; i < blockMeans.length; i++) {
    blockMeans[i] = blockCounts[i] > 0 ? blockMeans[i] / blockCounts[i] : 255;
  }

  if (!hasUnevenLighting(blockMeans)) {
    // Genuinely even lighting already — don't touch the image, avoid
    // the extra compute for zero real benefit.
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? (file instanceof Blob ? file : new Blob([file]))), "image/jpeg", 0.9);
    });
  }

  // Pass 2 — normalize each pixel against a bilinearly-interpolated
  // local background estimate, so the correction changes smoothly
  // across block boundaries instead of visible seams.
  const targetMean = 200; // push the local background toward a consistent light gray
  for (let y = 0; y < height; y++) {
    const byF = y / BLOCK_SIZE - 0.5;
    const by0 = Math.max(0, Math.min(blocksY - 1, Math.floor(byF)));
    const by1 = Math.max(0, Math.min(blocksY - 1, by0 + 1));
    const fy = Math.max(0, Math.min(1, byF - by0));

    for (let x = 0; x < width; x++) {
      const bxF = x / BLOCK_SIZE - 0.5;
      const bx0 = Math.max(0, Math.min(blocksX - 1, Math.floor(bxF)));
      const bx1 = Math.max(0, Math.min(blocksX - 1, bx0 + 1));
      const fx = Math.max(0, Math.min(1, bxF - bx0));

      const m00 = blockMeans[by0 * blocksX + bx0];
      const m01 = blockMeans[by0 * blocksX + bx1];
      const m10 = blockMeans[by1 * blocksX + bx0];
      const m11 = blockMeans[by1 * blocksX + bx1];
      const localBg = m00 * (1 - fx) * (1 - fy) + m01 * fx * (1 - fy) + m10 * (1 - fx) * fy + m11 * fx * fy;

      const idx = (y * width + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const corrected = Math.max(0, Math.min(255, gray - localBg + targetMean));
      data[idx] = data[idx + 1] = data[idx + 2] = corrected;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? (file instanceof Blob ? file : new Blob([file]))), "image/jpeg", 0.9);
  });
}
