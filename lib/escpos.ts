// ESC/POS is the de-facto standard command language understood by the
// overwhelming majority of thermal receipt printers (regardless of
// brand) — these are the genuine raw byte sequences, not an
// abstraction layer. Builds a Uint8Array ready to send to a printer
// over Bluetooth, USB, or serial.

import { THERMAL_58_DEFAULT, THERMAL_80_DEFAULT } from "./print/printerProfile";
import { buildDivider, buildHeaderRow, buildItemRowLines } from "./print/textGrid";
import { amountInWords } from "./amountInWords";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept in the signature so every existing .italic(true/false) call site still compiles; the parameter is genuinely unused now that this is a no-op
  italic(_on: boolean) {
    // THE actual root cause of a persistent, previously-mysterious
    // stray "5" printing before shop name, TOTAL, and Paid: this used
    // to send [ESC, 0x35] for italic-off — and 0x35 is ALSO the ASCII
    // byte for the character '5'. ESC 4 / ESC 5 for italic isn't part
    // of the universal core ESC/POS command set (unlike bold or
    // align), so a printer that doesn't implement it can fall back to
    // printing the unrecognized second byte as literal text — which
    // is exactly what a byte that happens to equal '5' would look
    // like. Every "5" reported traced back to a line immediately
    // preceded by an italic(false) call. Made a no-op rather than
    // finding yet another command byte to gamble on — italic is
    // cosmetic, not worth reintroducing this entire class of risk for.
    return this;
  }

  /** Double-height + double-width text, for totals/headers that need to stand out. */
  doubleSize(on: boolean) {
    // Genuinely a DIFFERENT command family from GS! (character size) —
    // ESC ! (select print mode) is a single bitmask byte covering
    // bold/double-height/double-width/underline together, and cheap
    // Bluetooth thermal printers implement it far more reliably than
    // GS!'s multiplier extension. Confirmed necessary: a printer that
    // couldn't handle GS! at ALL (regardless of value) was still
    // printing a stray literal character even when this used GS! with
    // the "safe" 0x11 value — the whole GS! family was the problem,
    // not a specific byte within it.
    return this.push([ESC, 0x21, on ? 0x30 : 0x00]); // ESC ! n — bit4+5 = double-height + double-width
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept in the signature so every existing .sizeLevel(n) call site still compiles; the parameter is genuinely unused now that this is a no-op
  sizeLevel(_level: number) {
    // Deliberately does NOTHING now. GS! (character size) and ESC!
    // (double-size) were both already ruled out as the cause of a
    // persistent "5" printing before certain lines — and this printer
    // STILL showed it after both were removed. ESC M (selectFont,
    // previously called here unconditionally) is the last remaining
    // font/size-related command in this path, so it's out too now.
    // Visual emphasis for shop name/total is bold() alone — see
    // buildReceiptEscPos, which already combines size-level with
    // bold rather than relying on this function for anything.
    return this;
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

export type ReceiptItem = {
  name: string;
  qty: number;
  price: number;
  lineTotal: number;
  /** GST rate and the line's tax, for the per-rate summary printed under the bill. */
  gstPercent?: number | null;
  taxAmount?: number | null;
};

export type ReceiptData = {
  shopName: string;
  shopAddress?: string | null;
  gstin?: string | null;
  isComposition?: boolean;
  invoiceNumber: string;
  dateText: string;
  /** When given, the date and time print as their own fields beside the bill number. */
  timeText?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Cash, UPI, … — printed in the bill's header and on the Paid line. */
  paymentLabel?: string | null;
  /** The buyer's GSTIN on a B2B bill (printed under the customer's name). */
  customerGstin?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  /** Combined-tax fallback for callers (KOT tickets, order slips) that
   * don't need a GST-compliant breakdown. Ignored whenever taxableAmount
   * is present, in favour of the detailed lines below. */
  taxTotal?: number;
  /** Detailed GST breakdown — when present, printed the same way as the
   * on-screen thermal preview (Taxable Value, then CGST+SGST or IGST,
   * then Round Off) instead of one combined "Tax" line, so a customer's
   * physical receipt shows the same tax split GST invoices are expected
   * to carry, not just less detail than what the owner previewed. */
  taxableAmount?: number;
  isIntraState?: boolean;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  roundOffAmount?: number;
  savingsOffMrp?: number;
  total: number;
  /** Old gold, a gold scheme or prepaid balance that paid part of the bill (printed before Paid). */
  exchangeLabel?: string | null;
  exchangeAmount?: number;
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
  // Same profile objects the on-screen thermal preview is built from
  // (lib/print/ThermalRenderer.tsx) — a printer-width tweak there is
  // never silently unmatched here.
  const profile = charsWide === 32 ? THERMAL_58_DEFAULT : THERMAL_80_DEFAULT;
  const wide = charsWide === 48;
  const n = (v: number) => v.toFixed(2);
  const qty = (v: number) => String(Number(v.toFixed(3)));
  // Tax lines only for a GST-registered regular dealer; a caller that doesn't say (no gstin field)
  // still gets them whenever it passes a taxable value.
  const showTax = !data.isComposition && (data.gstin === undefined || !!data.gstin);

  const b = new EscPosBuilder();
  // A totals line: label and amount sit at the right in one column, like a counter bill; `left`
  // (the item count, say) may use the space before them.
  const total = (label: string, value: string, left = "") => {
    const right = `${label} ${value.padStart(10)}`;
    b.text(left + " ".repeat(Math.max(1, charsWide - left.length - right.length)) + right).newline();
  };
  b.init();

  b.align("center").text(data.gstin && showTax ? "TAX INVOICE" : data.isComposition ? "BILL OF SUPPLY" : "INVOICE").newline();
  b.align(format.shopNameAlign).sizeLevel(format.shopNameSize).bold(format.shopNameBold || format.shopNameSize >= 2).italic(format.shopNameItalic).text(data.shopName).newline();
  b.sizeLevel(1).bold(false).italic(false).align("center");
  for (const line of wrap(data.shopAddress ?? "", charsWide)) b.text(line).newline();
  if (data.gstin) b.text(`GSTIN: ${data.gstin}`).newline();
  b.align("left");
  b.text(buildDivider(profile)).newline();

  const customer = `Customer: ${data.customerName || "Cash"}`;
  if (wide) {
    // Customer on the left, bill number / date / time on the right.
    const left = [customer, data.customerPhone ? `Mobile: ${data.customerPhone}` : "", data.paymentLabel ? `Payment: ${data.paymentLabel}` : ""].filter(Boolean);
    const right = [`Bill No. ${data.invoiceNumber}`, data.timeText ? `Date: ${data.dateText}` : data.dateText, data.timeText ? `Time: ${data.timeText}` : ""].filter(Boolean);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const r = right[i] ?? "";
      b.row((left[i] ?? "").slice(0, Math.max(0, charsWide - r.length - 1)), r, charsWide);
    }
  } else {
    b.row("Bill No.", data.invoiceNumber, charsWide);
    if (data.timeText) b.row(data.dateText, data.timeText, charsWide);
    else b.text(data.dateText).newline();
    for (const line of wrap(customer, charsWide)) b.text(line).newline();
    if (data.customerPhone) b.text(`Mobile: ${data.customerPhone}`).newline();
    if (data.paymentLabel) b.text(`Payment: ${data.paymentLabel}`).newline();
  }
  if (data.customerGstin) b.text(`GSTIN: ${data.customerGstin}`).newline();
  b.text(buildDivider(profile)).newline();

  b.bold(format.itemsBold);
  b.text(buildHeaderRow(profile)).newline();
  b.text(buildDivider(profile)).newline();
  for (const item of data.items) {
    const rowLines = buildItemRowLines(item.name, qty(item.qty), item.price.toFixed(2), item.lineTotal.toFixed(2), profile);
    for (const line of rowLines) b.text(line).newline();
  }
  b.bold(false);
  b.text(buildDivider(profile)).newline();

  const qtyTotal = data.items.reduce((sum, it) => sum + it.qty, 0);
  const counts = [`Items: ${data.items.length}`, `Qty: ${qty(qtyTotal)}`];
  const lines: [string, string][] = [["Sub Total:", n(data.subtotal)]];
  if (data.discount) lines.push(["Discount:", `-${n(data.discount)}`]);
  if (data.taxableAmount != null) {
    if (showTax) {
      lines.push(["Taxable Value:", n(data.taxableAmount)]);
      if (data.isIntraState) {
        if (data.cgstAmount) lines.push(["CGST:", n(data.cgstAmount)]);
        if (data.sgstAmount) lines.push(["SGST:", n(data.sgstAmount)]);
      } else if (data.igstAmount) {
        lines.push(["IGST:", n(data.igstAmount)]);
      }
    }
    if (data.roundOffAmount && Math.abs(data.roundOffAmount) > 0.001) {
      lines.push(["Round Off:", `${data.roundOffAmount > 0 ? "+" : "-"}${n(Math.abs(data.roundOffAmount))}`]);
    }
  } else if (data.taxTotal) {
    lines.push(["Tax:", n(data.taxTotal)]);
  }
  // On 58mm the counts take a line of their own; on 80mm they sit beside the first totals.
  if (!wide) b.text(counts.join("   ")).newline();
  lines.forEach(([label, value], i) => total(label, value, wide ? (counts[i] ?? "") : ""));
  if (wide) for (const c of counts.slice(lines.length)) b.text(c).newline();

  b.text(buildDivider(profile, "=")).newline();
  b.bold(format.totalBold || format.totalSize >= 2).italic(format.totalItalic).sizeLevel(format.totalSize);
  if (format.totalAlign === "left") {
    b.align("left");
    b.row("TOTAL", `Rs.${n(data.total)}`, charsWide);
  } else {
    b.align(format.totalAlign);
    b.text(`TOTAL Rs.${n(data.total)}`).newline();
  }
  b.align("left");
  b.sizeLevel(1).bold(false).italic(false);
  b.text(buildDivider(profile, "=")).newline();
  for (const line of wrap(amountInWords(data.total), charsWide)) b.text(line).newline();

  if (data.exchangeLabel && data.exchangeAmount && data.exchangeAmount > 0) total(`${data.exchangeLabel}:`, `-${n(data.exchangeAmount)}`);
  // (Nothing more to say when old gold, a scheme or prepaid balance covered it all.)
  if (data.paidAmount !== undefined && (data.paidAmount > 0 || !data.exchangeAmount)) total(data.paymentLabel ? `Paid (${data.paymentLabel}):` : "Paid:", n(data.paidAmount));
  if (data.creditAmount) total("Balance due (Udhaar):", n(data.creditAmount));
  if (data.savingsOffMrp) b.newline().align("center").text(`You saved Rs.${n(data.savingsOffMrp)} on MRP`).newline().align("left");

  // GST per rate — what a customer (or their CA) needs to check or claim the tax. The taxable part
  // is worked back from each line's tax, so it holds whether prices include GST or not.
  const rates = new Map<number, { taxable: number; tax: number }>();
  if (showTax && data.gstin && data.items.length > 0 && data.items.every((it) => it.gstPercent != null)) {
    for (const it of data.items) {
      const rate = Number(it.gstPercent);
      const tax = Number(it.taxAmount ?? 0);
      const r = rates.get(rate) ?? { taxable: 0, tax: 0 };
      r.taxable += rate > 0 ? (tax * 100) / rate : it.lineTotal;
      r.tax += tax;
      rates.set(rate, r);
    }
  }
  if (rates.size > 0) {
    const w = Math.floor((charsWide - 6) / 2);
    b.text(buildDivider(profile)).newline();
    b.text("GST%".padEnd(6) + "Taxable".padStart(w) + (data.isIntraState ? "CGST+SGST" : "IGST").padStart(charsWide - 6 - w)).newline();
    for (const [rate, r] of [...rates.entries()].sort((a, c) => a[0] - c[0])) {
      b.text(`${Number(rate.toFixed(2))}%`.padEnd(6) + n(r.taxable).padStart(w) + n(r.tax).padStart(charsWide - 6 - w)).newline();
    }
  }

  b.text(buildDivider(profile)).newline();
  b.row("E.&O.E.", `For ${data.shopName}`.slice(0, charsWide - 9), charsWide);
  b.newline();
  b.align("center");
  if (data.footerText) b.text(data.footerText).newline();
  b.text("Thank you! Visit again").newline();

  b.feedAndCut();
  return b.build();
}

/** Words onto lines of at most `width` characters. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
    while (line.length > width) {
      lines.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line) lines.push(line);
  return lines;
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
