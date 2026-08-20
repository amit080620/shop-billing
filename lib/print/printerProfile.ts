/** A thermal printer's actual printable configuration — physical paper
 * width and usable character-per-line count are genuinely different
 * things (the latter depends on printer model, margins, and font
 * mode), so this is deliberately configurable rather than a single
 * hardcoded assumption per paper size. The defaults below are the
 * genuinely most common values across real 58mm/80mm ESC/POS printers
 * using their default (Font A) mode, but any specific printer's
 * settings screen can override them. */
export type ThermalPrinterProfile = {
  /** Physical roll width, for display/UI purposes only — not used in
   * any character-grid math directly. */
  paperWidthMm: 58 | 80;
  /** The number of monospace characters that genuinely fit on one
   * printed line at this printer's current font/margin configuration
   * — this is what all column-width math is actually based on. */
  charactersPerLine: number;
  /** ESC/POS Font A (12x24, denser/smaller) or Font B (9x17,
   * genuinely larger per character, fewer chars fit per line). */
  fontMode: "A" | "B";
  leftMarginChars: number;
  rightMarginChars: number;
  boldSupport: boolean;
  doubleWidthSupport: boolean;
  doubleHeightSupport: boolean;
};

/** Genuine, widely-applicable defaults — a 58mm printer running Font A
 * commonly fits 32 characters per line; an 80mm printer commonly fits
 * 48. These are starting points, not hard assumptions: a specific
 * printer's own settings should be able to override charactersPerLine
 * directly without touching any other layout code. */
export const THERMAL_58_DEFAULT: ThermalPrinterProfile = {
  paperWidthMm: 58,
  charactersPerLine: 32,
  fontMode: "A",
  leftMarginChars: 0,
  rightMarginChars: 0,
  boldSupport: true,
  doubleWidthSupport: true,
  doubleHeightSupport: true,
};

export const THERMAL_80_DEFAULT: ThermalPrinterProfile = {
  paperWidthMm: 80,
  charactersPerLine: 48,
  fontMode: "A",
  leftMarginChars: 0,
  rightMarginChars: 0,
  boldSupport: true,
  doubleWidthSupport: true,
  doubleHeightSupport: true,
};

/** Usable content width after margins — what column-splitting math
 * should genuinely use, not the raw charactersPerLine. */
export function usableWidth(profile: ThermalPrinterProfile): number {
  return Math.max(8, profile.charactersPerLine - profile.leftMarginChars - profile.rightMarginChars);
}
