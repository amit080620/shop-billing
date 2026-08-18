// ESC/POS is the de-facto standard command language understood by the
// overwhelming majority of thermal receipt printers (regardless of
// brand) — these are the genuine raw byte sequences, not an
// abstraction layer. Builds a Uint8Array ready to send to a printer
// over Bluetooth, USB, or serial.

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

  /** Double-height + double-width text, for totals/headers that need to stand out. */
  doubleSize(on: boolean) {
    return this.push([GS, 0x21, on ? 0x11 : 0x00]); // GS ! n
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

/** Builds the full receipt as ESC/POS bytes. charsWide should be 32 for
 * 58mm paper or 48 for 80mm paper (standard characters-per-line for
 * those widths in the default font). */
export function buildReceiptEscPos(data: ReceiptData, charsWide: 32 | 48 = 32): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  b.align("center").doubleSize(true).bold(true).text(data.shopName).newline();
  b.doubleSize(false).bold(false);
  if (data.gstin) b.text(`GSTIN: ${data.gstin}`).newline();
  b.newline();

  b.align("left");
  b.text(`Bill: ${data.invoiceNumber}`).newline();
  b.text(data.dateText).newline();
  if (data.customerName) b.text(`Customer: ${data.customerName}`).newline();
  b.divider(charsWide);

  for (const item of data.items) {
    b.text(`${item.name}`).newline();
    b.row(`  ${item.qty} x Rs.${item.price.toFixed(2)}`, `Rs.${item.lineTotal.toFixed(2)}`, charsWide);
  }
  b.divider(charsWide);

  b.row("Subtotal", `Rs.${data.subtotal.toFixed(2)}`, charsWide);
  if (data.discount) b.row("Discount", `-Rs.${data.discount.toFixed(2)}`, charsWide);
  if (data.taxTotal) b.row("Tax", `Rs.${data.taxTotal.toFixed(2)}`, charsWide);

  b.bold(true).doubleSize(true);
  b.row("TOTAL", `Rs.${data.total.toFixed(2)}`, Math.floor(charsWide * 0.62));
  b.doubleSize(false).bold(false);

  if (data.paidAmount !== undefined) b.row("Paid", `Rs.${data.paidAmount.toFixed(2)}`, charsWide);
  if (data.creditAmount) b.row("Credit (Udhaar)", `Rs.${data.creditAmount.toFixed(2)}`, charsWide);

  b.newline();
  b.align("center");
  if (data.footerText) b.text(data.footerText).newline();
  b.text("Thank you, visit again!").newline();

  b.feedAndCut();
  return b.build();
}
