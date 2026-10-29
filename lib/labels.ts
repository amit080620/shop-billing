/** Barcode stickers on a thermal label printer (TSC, Godex, Xprinter label models, …).
 *
 * Label printers don't speak the bill printers' ESC/POS; they speak TSPL. Sent RAW through The Ray
 * Print Helper, the printer is told the exact sticker size and the gap between stickers, so it
 * prints exactly the number asked for — filling the stickers side by side on a 2-across roll — and
 * stops at the next gap, instead of treating a browser page as one long sticker and feeding a
 * stretch of the roll through. The printer's own fonts and barcode engine make the sticker sharp.
 *
 * The same layout also sizes the browser's print page, for a computer without the helper. */

export type LabelLayout = {
  /** One sticker. */
  widthMm: number;
  heightMm: number;
  /** Stickers side by side across the roll. */
  columns: number;
  /** Space between two stickers across the roll. */
  columnGapMm: number;
  /** Gap between rows down the roll (the printer finds it with its gap sensor). */
  rowGapMm: number;
};

export type LabelPreset = { id: string; label: string; layout: LabelLayout };

export const LABEL_PRESETS: LabelPreset[] = [
  { id: "50x25x2", label: "50 × 25 mm, 2 across", layout: { widthMm: 50, heightMm: 25, columns: 2, columnGapMm: 2, rowGapMm: 2 } },
  { id: "38x25x2", label: "38 × 25 mm, 2 across", layout: { widthMm: 38, heightMm: 25, columns: 2, columnGapMm: 2, rowGapMm: 2 } },
  { id: "50x25x1", label: "50 × 25 mm, 1 across", layout: { widthMm: 50, heightMm: 25, columns: 1, columnGapMm: 0, rowGapMm: 2 } },
  { id: "38x25x1", label: "38 × 25 mm, 1 across", layout: { widthMm: 38, heightMm: 25, columns: 1, columnGapMm: 0, rowGapMm: 2 } },
  { id: "50x30x1", label: "50 × 30 mm, 1 across", layout: { widthMm: 50, heightMm: 30, columns: 1, columnGapMm: 0, rowGapMm: 2 } },
  { id: "33x22x3", label: "33 × 22 mm, 3 across", layout: { widthMm: 33, heightMm: 22, columns: 3, columnGapMm: 2, rowGapMm: 2 } },
];

export const DEFAULT_LABEL_LAYOUT = LABEL_PRESETS[0].layout;

export type LabelItem = {
  name: string;
  /** Selling price. */
  price: number;
  mrp?: number | null;
  unit?: string | null;
  code: string;
};

/** Every sticker in printing order, filling each row left to right. */
export function labelRows<T>(labels: T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < labels.length; i += columns) rows.push(labels.slice(i, i + columns));
  return rows;
}

/** Width the printer prints across: every sticker in a row and the gaps between them. */
export const rowWidthMm = (l: LabelLayout) => l.columns * l.widthMm + (l.columns - 1) * l.columnGapMm;

const DOTS_PER_MM = 8; // 203 dpi, what almost every thermal label printer runs at.

// TSPL's built-in bitmap fonts (in every TSC printer): [character width, height] in dots at 1×.
const FONT: Record<string, [number, number]> = { "1": [8, 12], "2": [12, 20], "3": [16, 24], "4": [24, 32] };

/** Text the printer can print: plain ASCII (its fonts have nothing else), a double quote escaped the TSPL way. */
function tsplText(text: string): string {
  return text
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/"/g, '\\["]');
}

const fit = (text: string, maxChars: number) => (text.length <= maxChars ? text : text.slice(0, Math.max(1, maxChars - 1)) + ".");
const money = (n: number) => n.toFixed(2);

/** Code 128 (set B) width in modules: start + data + checksum (11 each) + stop (13). */
function code128Modules(code: string) {
  return 11 * code.length + 35;
}

/** One sticker, at x0 dots from the left edge of the row. Laid out like a counter POS sticker: shop
 * name centred on top, the item's name, the MRP (and the shop's lower price when there is one), the
 * barcode, and its number under it. */
function stickerCommands(item: LabelItem, shopName: string, x0: number, layout: LabelLayout): string[] {
  const w = Math.round(layout.widthMm * DOTS_PER_MM);
  const h = Math.round(layout.heightMm * DOTS_PER_MM);
  const pad = 12;
  const inner = w - 2 * pad;
  const out: string[] = [];
  const small = layout.widthMm < 45;
  const head = small ? "2" : "3";
  const body = small ? "2" : "3";
  const tiny = small ? "1" : "2";
  const chars = (font: string) => Math.floor(inner / FONT[font][0]);
  const centred = (text: string, font: string, y: number) => {
    const t = fit(text, chars(font));
    const x = x0 + pad + Math.max(0, Math.floor((inner - t.length * FONT[font][0]) / 2));
    out.push(`TEXT ${x},${y},"${font}",0,1,1,"${tsplText(t)}"`);
  };
  const left = (text: string, font: string, y: number) => out.push(`TEXT ${x0 + pad},${y},"${font}",0,1,1,"${tsplText(fit(text, chars(font)))}"`);

  // Rows, top to bottom, spaced to the sticker's height.
  const unit = h / 200; // the layout is drawn for a 25 mm sticker and scaled to others
  let y = Math.round(8 * unit);
  centred(shopName.toUpperCase(), head, y);
  y += FONT[head][1] + Math.round(6 * unit);
  left(item.name.toUpperCase(), body, y);
  y += FONT[body][1] + Math.round(4 * unit);

  const mrp = item.mrp != null && item.mrp > 0 ? item.mrp : null;
  const priceLine =
    mrp && item.price < mrp ? `MRP ${money(mrp)}  Our ${money(item.price)}` : `MRP ${money(mrp ?? item.price)}`;
  // On a narrow sticker drop the paise from whole rupees rather than cut the price off.
  left(priceLine.length > chars(body) ? priceLine.replace(/\.00\b/g, "") : priceLine, body, y);
  y += FONT[body][1] + Math.round(6 * unit);

  // The barcode, centred, as wide as fits: 2-dot bars where they fit (scan best), else 1-dot.
  const numberHeight = FONT[tiny][1];
  const barHeight = Math.max(24, h - y - numberHeight - Math.round(10 * unit));
  const narrow = code128Modules(item.code) * 2 <= inner ? 2 : 1;
  const barWidth = code128Modules(item.code) * narrow;
  const bx = x0 + pad + Math.max(0, Math.floor((inner - barWidth) / 2));
  // "128M" with !104 = Code 128 set B throughout, so the width above is exact and the code centres.
  out.push(`BARCODE ${bx},${y},"128M",${barHeight},0,0,${narrow},${narrow},"!104${tsplText(item.code)}"`);
  y += barHeight + Math.round(3 * unit);
  centred(item.code, tiny, y);
  return out;
}

/** The TSPL program for these stickers: exactly `items.length` stickers, side by side, then stop. */
export function buildLabelTspl(items: LabelItem[], shopName: string, layout: LabelLayout): Uint8Array {
  const lines = [
    `SIZE ${rowWidthMm(layout)} mm, ${layout.heightMm} mm`,
    `GAP ${layout.rowGapMm} mm, 0 mm`,
    "DIRECTION 1",
    "REFERENCE 0,0",
    "OFFSET 0 mm",
    "SET TEAR ON",
    "CODEPAGE 1252",
  ];
  const step = Math.round((layout.widthMm + layout.columnGapMm) * DOTS_PER_MM);
  for (const row of labelRows(items, layout.columns)) {
    lines.push("CLS");
    row.forEach((item, c) => lines.push(...stickerCommands(item, shopName, c * step, layout)));
    lines.push("PRINT 1,1");
  }
  const text = lines.join("\r\n") + "\r\n";
  return new Uint8Array(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
}
