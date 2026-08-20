import type { ThermalPrinterProfile } from "./printerProfile";
import { usableWidth } from "./printerProfile";

export type ThermalColumnWidths = {
  item: number;
  qty: number;
  rate: number;
  amount: number;
};

/** Genuinely fixed-width numeric columns (quantities/prices rarely
 * need more digits than this), with whatever space remains going to
 * the item name column — the one column that actually needs to
 * flex/wrap based on content. One space of gap is reserved between
 * each column. */
export function computeColumnWidths(profile: ThermalPrinterProfile): ThermalColumnWidths {
  const total = usableWidth(profile);
  const qty = 3;
  const rate = 6;
  const amount = 7;
  const gaps = 3; // one space between each of the 4 columns
  const item = Math.max(6, total - qty - rate - amount - gaps);
  return { item, qty, rate, amount };
}

function padLeft(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return " ".repeat(width - t.length) + t;
}

function padRight(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text;
  return t + " ".repeat(width - t.length);
}

/** Genuinely wraps a single word/name across multiple lines of a fixed
 * width, breaking on spaces where possible and only hard-breaking a
 * single word that's itself longer than the column (rare, but must
 * never be allowed to overflow into the numeric columns regardless). */
function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length > width) {
      // A single genuinely-too-long word (rare) — hard-break it
      // rather than let it overflow the column.
      let remaining = word;
      while (remaining.length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      current = remaining;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Builds the exact printed lines for one item row — the item name
 * wraps across as many lines as it genuinely needs; Qty/Rate/Amount
 * appear only once, right-aligned in their fixed columns on the final
 * wrapped line. Every returned line is exactly `usableWidth(profile)`
 * characters, so column alignment can never drift regardless of how
 * long the item name is. */
export function buildItemRowLines(
  name: string,
  qty: string,
  rate: string,
  amount: string,
  profile: ThermalPrinterProfile,
): string[] {
  const cols = computeColumnWidths(profile);
  const nameLines = wrapText(name, cols.item);
  const lastIdx = nameLines.length - 1;

  return nameLines.map((line, i) => {
    if (i !== lastIdx) {
      // A wrapped continuation line — just the item text, no numbers
      // yet, so a long name never visually implies a second row of
      // quantity/price data that doesn't exist.
      return padRight(line, cols.item);
    }
    return [padRight(line, cols.item), padLeft(qty, cols.qty), padLeft(rate, cols.rate), padLeft(amount, cols.amount)].join(
      " ",
    );
  });
}

/** The column-header row ("PARTICULARS   QTY  RATE  AMOUNT"), built to
 * the exact same widths as the item rows below it. */
export function buildHeaderRow(profile: ThermalPrinterProfile): string {
  const cols = computeColumnWidths(profile);
  return [padRight("PARTICULARS", cols.item), padLeft("QTY", cols.qty), padLeft("RATE", cols.rate), padLeft("AMOUNT", cols.amount)].join(
    " ",
  );
}

/** A generic two-column row (label ... value), used for totals —
 * genuinely fills to the printer's full usable width regardless of
 * the 4-column item layout above it. */
export function buildTwoColumnRow(label: string, value: string, profile: ThermalPrinterProfile): string {
  const width = usableWidth(profile);
  const space = Math.max(1, width - label.length - value.length);
  return label + " ".repeat(space) + value;
}

export function buildDivider(profile: ThermalPrinterProfile, char = "-"): string {
  return char.repeat(usableWidth(profile));
}
