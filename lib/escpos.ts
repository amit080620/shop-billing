// ESC/POS is the de-facto standard command language understood by the
// overwhelming majority of thermal receipt printers (regardless of
// brand) — these are the genuine raw byte sequences, not an
// abstraction layer. Builds a Uint8Array ready to send to a printer
// over Bluetooth, USB, or serial.

import type { ThermalPrinterProfile } from "./print/printerProfile";
import { buildDivider, buildHeaderRow, buildItemRowLines } from "./print/textGrid";

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private chunks: number[][] = [];

  private push(bytes: number[]) {
    this.chunks.push(bytes);
    return this;
  }

  init() {
    return this.push([ESC, 0x40]); // ESC @ — reset printer state
  }

  align(mode: "left" | "center" | "right") {
    const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
    return this.push([ESC, 0x61, n]); // ESC a n
  }

  bold(on: boolean) {
    return this.push([ESC, 0x45, on ? 1 : 0]); // ESC E n
  }

  /** Genuinely italic — ESC 4 (on) / ESC 5 (off), part of the
   * standard Epson ESC/POS command set. Support varies by printer
   * model (less universal than bold/underline), but it's a genuine,
   * real command, not a fabricated one. */
  italic(on: boolean) {
    return this.push([ESC, on ? 0x34 : 0x35]);
  }

  /** Double-height + double-width text, for totals/headers that need to stand out. */
  doubleSize(on: boolean) {
    return this.push([GS, 0x21, on ? 0x11 : 0x00]); // GS ! n
  }

  /** ESC M n — selects the printer's built-in alternate character
   * font. Font A (n=0) is the default/larger font every size level
   * above is measured from; Font B (n=1) is a genuinely smaller,
   * condensed font baked into the printer's own hardware. This is
   * the ONLY way to print smaller than "normal" on real ESC/POS
   * thermal printers — GS ! (sizeLevel below) can only multiply a
   * font's OWN base size upward, it cannot shrink below whichever
   * font is currently selected. */
  selectFont(condensed: boolean) {
    return this.push([ESC, 0x4d, condensed ? 1 : 0]); // ESC M n
  }

  /** Genuinely a real, hardware-accurate size level, using the SAME
   * GS ! command's width/height multiplier nibbles — this is what
   * ESC/POS printers actually support (discrete multiplier steps of
   * the base font), not arbitrary point sizes like a word processor.
   *
   * Level 0 = "Small" — switches to the printer's condensed Font B
   * (see selectFont above) at its own native 1× size. This is a
   * real, distinct physical size, genuinely smaller than level 1 on
   * real hardware — not a fake in-between step, since ESC/POS has no
   * concept of a fractional multiplier.
   * Level 1 = normal size (Font A). Each step above that is one
   * multiplier larger in both width and height simultaneously. */
  sizeLevel(level: number) {
    // Level 2 ("Large") is by far the most commonly selected step up
    // from normal — routing it through the simple, universal
    // doubleSize() on/off toggle instead of the raw multiplier-nibble
    // encoding avoids a real compatibility problem: several cheap/
    // generic thermal printers (common, low-cost Bluetooth models)
    // don't fully implement GS! for arbitrary multiplier values and
    // can echo the unrecognized parameter byte as literal printable
    // text instead of applying it as a size command. doubleSize()
    // uses only the well-established 0x00/0x11 values every ESC/POS
    // printer genuinely supports.
    if (level === 2) {
      this.selectFont(false);
      return this.doubleSize(true);
    }
    if (level === 1) {
      this.selectFont(false);
      return this.doubleSize(false);
    }
    this.selectFont(level === 0);
    const n = level === 0 ? 0 : Math.max(0, Math.min(7, level - 1));
    return this.push([GS, 0x21, (n << 4) | n]);
  }

  underline(on: boolean) {
    return this.push([ESC, 0x2d, on ? 1 : 0]); // ESC - n
  }

  text(str: string) {
    // Thermal printers expect single-byte encodings (commonly CP437/
    // Windows-1252-like) — non-ASCII characters (₹, é, etc.) are
    // replaced with a safe fallback since most cheap printers can't
    // render them and would otherwise print garbage bytes.
    const bytes = Array.from(str).map((ch) => {
      const code = ch.codePointAt(0) ?? 63;
      if (code === 0x20ac || ch === "₹") return 0x52 /* 'R' as a safe Rs. stand-in */;
      return code < 256 ? code : 0x3f; // '?'
    });
    return this.push(bytes);
  }

  newline(lines = 1) {
    for (let i = 0; i < lines; i++) this.push([0x0a]);
    return this;
  }

  /** A full-width dashed divider line — length depends on paper width. */
  divider(charsWide: number) {
    return this.text("-".repeat(charsWide)).newline();
  }

  /** Two-column row (e.g. "Item name" ... "₹120.00"), padded to fit. */
  row(left: string, right: string, charsWide: number) {
    const space = Math.max(1, charsWide - left.length - right.length);
    return this.text(left + " ".repeat(space) + right).newline();
  }

  cutPaper() {
    return this.push([GS, 0x56, 0x00]); // GS V 0 — full cut
  }

  feedAndCut() {
    return this.newline(3).cutPaper();
  }

  build(): Uint8Array {
    const flat = this.chunks.flat();
    return new Uint8Array(flat);
  }
}

export type ReceiptItem = { name: string; qty: number; price: number; lineTotal: number };

export type ReceiptData = {
  shopName: string;
  gstin?: string | null;
  invoiceNumber: string;
  dateText: string;
  customerName?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  taxTotal?: number;
  total: number;
  paidAmount?: number;
  creditAmount?: number;
  footerText?: string | null;
};

export type ReceiptFormatSettings = {
  shopNameBold: boolean;
  shopNameItalic: boolean;
  shopNameSize: number;
  shopNameAlign: "left" | "center" | "right";
  itemsBold: boolean;
  totalBold: boolean;
  totalItalic: boolean;
  totalSize: number;
  totalAlign: "left" | "center" | "right";
};

const DEFAULT_FORMAT_SETTINGS: ReceiptFormatSettings = {
  shopNameBold: true,
  shopNameItalic: false,
  shopNameSize: 2,
  shopNameAlign: "center",
  itemsBold: false,
  totalBold: true,
  totalItalic: false,
  totalSize: 2,
  totalAlign: "left",
};

/** Builds the full receipt as ESC/POS bytes. charsWide should be 32 for
 * 58mm paper or 48 for 80mm paper (standard characters-per-line for
 * those widths in the default font). Uses the same genuine
 * column-preserving grid algorithm as the on-screen thermal preview
 * (lib/print/textGrid.ts), so a long item name wraps exactly the same
 * way on the real printed receipt as it does in the browser preview —
 * never independently calculated. Formatting (bold/large-size) for the
 * shop name, item table, and total line is genuinely controlled by
 * the owner's own thermal print settings, not hardcoded, since a
 * Bluetooth printer renders its own text with no CSS involved. */
export function buildReceiptEscPos(data: ReceiptData, charsWide: 32 | 48 = 32, format: ReceiptFormatSettings = DEFAULT_FORMAT_SETTINGS): Uint8Array {
  const profile: ThermalPrinterProfile = {
    paperWidthMm: charsWide === 32 ? 58 : 80,
    charactersPerLine: charsWide,
    fontMode: "A",
    leftMarginChars: 0,
    rightMarginChars: 0,
    boldSupport: true,
    doubleWidthSupport: true,
    doubleHeightSupport: true,
  };

  const b = new EscPosBuilder();
  b.init();

  b.align(format.shopNameAlign).sizeLevel(format.shopNameSize).bold(format.shopNameBold).italic(format.shopNameItalic).text(data.shopName).newline();
  b.sizeLevel(1).bold(false).italic(false);
  if (data.gstin) b.text(`GSTIN: ${data.gstin}`).newline();
  b.newline();

  b.align("left");
  b.text(`Bill: ${data.invoiceNumber}`).newline();
  b.text(data.dateText).newline();
  if (data.customerName) b.text(`Customer: ${data.customerName}`).newline();
  b.text(buildDivider(profile)).newline();

  b.bold(format.itemsBold);
  b.text(buildHeaderRow(profile)).newline();
  for (const item of data.items) {
    const rowLines = buildItemRowLines(item.name, String(item.qty), item.price.toFixed(2), item.lineTotal.toFixed(2), profile);
    for (const line of rowLines) b.text(line).newline();
  }
  b.bold(false);
  b.text(buildDivider(profile)).newline();

  b.row("Subtotal", `Rs.${data.subtotal.toFixed(2)}`, charsWide);
  if (data.discount) b.row("Discount", `-Rs.${data.discount.toFixed(2)}`, charsWide);
  if (data.taxTotal) b.row("Tax", `Rs.${data.taxTotal.toFixed(2)}`, charsWide);

  b.bold(format.totalBold).italic(format.totalItalic).sizeLevel(format.totalSize);
  if (format.totalAlign === "left") {
    b.align("left");
    b.row("TOTAL", `Rs.${data.total.toFixed(2)}`, charsWide);
  } else {
    b.align(format.totalAlign);
    b.text(`TOTAL Rs.${data.total.toFixed(2)}`).newline();
  }
  b.align("left");
  b.sizeLevel(1).bold(false).italic(false);

  if (data.paidAmount !== undefined) b.row("Paid", `Rs.${data.paidAmount.toFixed(2)}`, charsWide);
  if (data.creditAmount) b.row("Credit (Udhaar)", `Rs.${data.creditAmount.toFixed(2)}`, charsWide);

  b.newline();
  b.align("center");
  if (data.footerText) b.text(data.footerText).newline();
  b.text("Thank you, visit again!").newline();

  b.feedAndCut();
  return b.build();
}

export type KotData = {
  title: string;
  subtitle: string;
  items: { name: string; qty: number; modifiers?: string[] }[];
};

/** Builds a plain kitchen order ticket — item names and quantities
 * only, deliberately no prices/totals (the kitchen doesn't need
 * money on this slip). Shared by every KOT print point in the app
 * (restaurant table orders, online catalog orders) so the format only
 * needs to be gotten right once. */
export function buildKotEscPos(data: KotData, charsWide: 32 | 48 = 32): Uint8Array {
  const b = new EscPosBuilder();
  b.init().align("center").bold(true).sizeLevel(2).text(data.title).newline().sizeLevel(1).bold(false);
  b.text(data.subtitle).newline().align("left").divider(charsWide);

  for (const item of data.items) {
    b.bold(true).text(`${item.qty} x ${item.name}`).newline().bold(false);
    for (const mod of item.modifiers ?? []) {
      b.text(`   - ${mod}`).newline();
    }
  }

  b.divider(charsWide).feedAndCut();
  return b.build();
}
