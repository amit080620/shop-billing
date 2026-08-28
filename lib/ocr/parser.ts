import type { OCRResult, OCRWord, ExtractedPettyCashFields } from "./types";

// Keywords that precede a bill's final payable amount, in priority
// order — "GRAND TOTAL" is a stronger signal than a bare "TOTAL" (which
// sometimes labels a subtotal), so earlier entries win on a tie.
const TOTAL_KEYWORDS = ["GRAND TOTAL", "NET TOTAL", "NET AMOUNT", "TOTAL PAYABLE", "AMOUNT PAYABLE", "TOTAL", "AMOUNT"];

// Deterministic, context-aware OCR digit-error correction — only
// applied to strings that already look numeric, so a store name like
// "SOMA STORES" is never mangled into "50MA5TORE5".
export function correctNumericOCR(raw: string): string {
  if (!/^[\dOIlSBoOZg.,₹Rs\s]+$/i.test(raw)) return raw;
  return raw
    .replace(/O/g, "0")
    .replace(/o/g, "0")
    .replace(/I/g, "1")
    .replace(/l/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/z/g, "2")
    .replace(/g/g, "9");
}

function parseAmount(text: string): number | null {
  const cleaned = correctNumericOCR(text.replace(/[₹Rs.]/gi, "").trim());
  const match = cleaned.match(/[\d,]+\.?\d{0,2}/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Finds the most likely total by scanning lines for a TOTAL-family
 * keyword and taking the first plausible currency number that appears
 * on the same line or the next one — not "the biggest number on the
 * receipt" (which is a common false-positive: an MRP or a phone
 * number is often larger than the actual bill total). */
function extractAmount(lines: string[]): { value: number; confidence: number } | null {
  for (const keyword of TOTAL_KEYWORDS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toUpperCase();
      if (!line.includes(keyword)) continue;

      // Same line first (most common layout: "TOTAL  245.00")
      const sameLine = parseAmount(lines[i].slice(line.indexOf(keyword) + keyword.length));
      if (sameLine !== null) {
        const isStrongKeyword = keyword.includes("GRAND") || keyword.includes("NET") || keyword.includes("PAYABLE");
        return { value: sameLine, confidence: isStrongKeyword ? 90 : 70 };
      }
      // Some receipts put the number on the very next line instead
      if (i + 1 < lines.length) {
        const nextLine = parseAmount(lines[i + 1]);
        if (nextLine !== null) return { value: nextLine, confidence: 60 };
      }
    }
  }

  // Fallback: no TOTAL-style keyword matched at all — take the last
  // currency-shaped number on the receipt (bottom-of-bill position is
  // still a meaningful, if weaker, signal) and flag it as low
  // confidence so the user reviews it before it's trusted.
  for (let i = lines.length - 1; i >= 0; i--) {
    const value = parseAmount(lines[i]);
    if (value !== null && value >= 1) {
      return { value, confidence: 35 };
    }
  }
  return null;
}

/** The vendor/store name is almost always the first substantial line
 * of text on a receipt — this is a weak-but-usable heuristic rather
 * than true understanding, so it's deliberately capped at medium
 * confidence and always left editable. */
function extractVendorName(lines: string[]): { value: string; confidence: number } | null {
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    // Skip lines that are mostly numbers/symbols (phone numbers, dates,
    // separators) — a real store name is mostly letters.
    const letters = trimmed.replace(/[^a-zA-Z]/g, "").length;
    if (trimmed.length >= 3 && letters / trimmed.length > 0.5) {
      return { value: trimmed, confidence: 55 };
    }
  }
  return null;
}

// dd/mm/yyyy, dd-mm-yyyy, dd Mon yyyy — the common Indian receipt formats.
const DATE_PATTERNS = [
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
  /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i,
];

function extractDate(text: string): { value: string; confidence: number } | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { value: match[1], confidence: 65 };
  }
  return null;
}

/** Entry point — deterministic, rule-based, no AI. Every field carries
 * its own confidence score, and every field is nullable: a bill
 * missing GST or a date is normal, not an error. */
export function parsePettyCashFields(ocr: OCRResult): ExtractedPettyCashFields {
  const lines = ocr.rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  return {
    vendorName: extractVendorName(lines),
    amount: extractAmount(lines),
    date: extractDate(ocr.rawText),
    rawText: ocr.rawText,
  };
}

// Exported for testing independently of OCR/UI, per the "parser must be
// testable on its own" requirement.
export const _internal = { parseAmount, correctNumericOCR, extractAmount, extractVendorName, extractDate };
export type { OCRWord };

/** A vendor bill's item rows are almost always "description ... qty
 * ... rate" (sometimes with a trailing line total too, which is
 * intentionally ignored here — quantity × rate is recomputed by the
 * purchase form itself, so a mismatched OCR'd total can never
 * silently override the two numbers that actually matter). Lines
 * that don't match this shape (headers, the bill's own totals,
 * GSTIN/address lines) are simply skipped — deterministic, no AI,
 * and every result stays in the form's normal editable rows for
 * review before saving, same as the menu-scan path.
 *
 * Deliberately token-by-token rather than one big regex: an ordinary
 * word like "Oil" contains O/I/l, the exact letters this file treats
 * as OCR digit-confusion, so a case-insensitive whole-line pattern
 * can misread a real word as part of the price. Checking each
 * whitespace-separated token on its own for being genuinely
 * number-shaped avoids that. */
export function parsePurchaseBillItems(rawLines: string[]): { description: string; quantity: number; unitPrice: number }[] {
  const lines = rawLines.map((l) => l.trim().replace(/[|;:]+$/, "")).filter((l) => l.length > 2);
  const skipWords = /^(total|subtotal|grand total|gstin|gst no|invoice|bill no|amount|net amount|cgst|sgst|igst|discount)\b/i;

  function toNumber(token: string): number | null {
    const cleaned = token.replace(/^(rs\.?|inr|₹)/i, "").replace(/,/g, "");
    // Case-SENSITIVE on purpose — only the specific OCR-confusable
    // letters (O, I, l, S, B, Z, g), not their lowercase/uppercase
    // counterparts, which is what keeps real words from matching.
    if (!/^[0-9OIlSBZg.]+$/.test(cleaned)) return null;
    const n = parseFloat(correctNumericOCR(cleaned));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const items: { description: string; quantity: number; unitPrice: number }[] = [];
  for (const line of lines) {
    if (skipWords.test(line)) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) continue;

    const last = toNumber(tokens[tokens.length - 1]);
    const secondLast = toNumber(tokens[tokens.length - 2]);
    const thirdLast = tokens.length >= 3 ? toNumber(tokens[tokens.length - 3]) : null;

    let quantity: number, unitPrice: number, descTokenCount: number;
    if (last !== null && secondLast !== null && thirdLast !== null) {
      // Three trailing numbers = qty, rate, line-total — take the
      // first two, the total is recomputed by the form anyway.
      quantity = thirdLast;
      unitPrice = secondLast;
      descTokenCount = tokens.length - 3;
    } else if (last !== null && secondLast !== null) {
      quantity = secondLast;
      unitPrice = last;
      descTokenCount = tokens.length - 2;
    } else {
      continue;
    }

    const description = tokens.slice(0, descTokenCount).join(" ").trim();
    if (description.length < 2 || skipWords.test(description)) continue;
    if (quantity <= 0 || quantity > 100000) continue;
    if (unitPrice <= 0 || unitPrice > 10000000) continue;

    items.push({ description, quantity, unitPrice });
  }
  return items;
}
