// Labels printed by a weighing scale: a 13-digit barcode that starts with the shop's scale prefix
// (usually "2" or "21"), then the item's code (its PLU, saved as the item's barcode), then the
// weight in grams or the price in paise, then a check digit. Pure, so New Bill and the tests agree.

export type ScaleSettings = { prefix: string; mode: "weight" | "price"; codeDigits: number };

/** EAN-13's check digit is right: a misread label is not billed. */
export function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** The item code and the weight (kg) or price (₹) in a scale label, or null when it isn't one. */
export function parseScaleBarcode(code: string, s: ScaleSettings | null): { plu: string; weightKg?: number; price?: number } | null {
  if (!s?.prefix || !/^\d{1,3}$/.test(s.prefix)) return null;
  const c = code.trim();
  if (!c.startsWith(s.prefix) || !ean13Valid(c)) return null;
  const digits = Math.max(4, Math.min(6, Math.round(s.codeDigits) || 5));
  const valueDigits = 12 - s.prefix.length - digits;
  if (valueDigits < 4) return null;
  const plu = c.slice(s.prefix.length, s.prefix.length + digits);
  const value = Number(c.slice(s.prefix.length + digits, 12));
  if (!(value > 0)) return null;
  return s.mode === "price" ? { plu, price: value / 100 } : { plu, weightKg: value / 1000 };
}

/** Whether an item's saved barcode is this PLU ("00123", "0123" and "123" all match 123). */
export const pluMatches = (barcode: string | null, plu: string) => !!barcode && /^\d+$/.test(barcode.trim()) && Number(barcode.trim()) === Number(plu);
