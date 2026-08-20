"use client";

/** How sharp a photo needs to be to bother running OCR on it. Tuned
 * empirically against typical phone-camera receipt/menu photos — well
 * below what a genuinely sharp shot scores, but high enough to catch
 * a photo taken while the hand was still moving or badly out of focus. */
const BLUR_THRESHOLD = 60;

/** Runs a genuine 3×3 Laplacian edge-detection kernel over a
 * downscaled grayscale copy of the image, then computes the variance
 * of the response. Sharp edges produce large swings in the Laplacian
 * (high variance); a blurry image's edges are soft, producing a flat,
 * low-variance response. This is the same technique behind OpenCV's
 * own `cv2.Laplacian(img, CV_64F).var()` blur check. */
export async function detectBlur(image: Blob): Promise<{ isBlurry: boolean; score: number }> {
  const bitmap = await createImageBitmap(image);

  // A small working copy is enough to judge sharpness and keeps this
  // fast — blur is a low-frequency property, it doesn't need full
  // resolution to detect.
  const SAMPLE_SIZE = 400;
  const scale = SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { isBlurry: false, score: BLUR_THRESHOLD };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  }

  // 3x3 Laplacian kernel: [[0,1,0],[1,-4,1],[0,1,0]] — a standard
  // second-derivative edge operator, applied to every interior pixel.
  const laplacian = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      laplacian[idx] =
        gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
    }
  }

  // Variance of the Laplacian response — the genuine sharpness score.
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      sum += laplacian[y * width + x];
      count++;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  let variance = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const d = laplacian[y * width + x] - mean;
      variance += d * d;
    }
  }
  variance = count > 0 ? variance / count : 0;

  return { isBlurry: variance < BLUR_THRESHOLD, score: variance };
}
