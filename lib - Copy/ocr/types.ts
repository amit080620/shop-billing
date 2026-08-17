/** One recognized word from Tesseract, with its position on the image —
 * needed to tell "is this number near the word TOTAL" from "is this
 * some random quantity halfway up the receipt". */
export type OCRWord = {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OCRResult = {
  rawText: string;
  words: OCRWord[];
};

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/** What the Petty Cash scan flow actually needs — deliberately not a
 * full line-item bill breakdown (Petty Cash entries are just
 * description + amount + category, not itemized invoices). */
export type ExtractedPettyCashFields = {
  vendorName: { value: string; confidence: number } | null;
  amount: { value: number; confidence: number } | null;
  date: { value: string; confidence: number } | null;
  rawText: string;
};
