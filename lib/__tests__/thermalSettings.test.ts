import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReceiptEscPos, type ReceiptData, type ReceiptFormatSettings } from "../escpos";
import { ThermalRenderer, type ThermalReceiptData } from "../print/ThermalRenderer";
import { DEFAULT_THERMAL_FORMAT, sizeEm, thermalFormatFor, type ThermalFormat } from "../print/thermalFormat";

const receipt: ReceiptData = {
  shopName: "Sharma Store",
  gstin: "27ABCDE1234F1Z5",
  invoiceNumber: "2026-27/00042",
  dateText: "26 Sept 2026",
  items: [{ name: "Rice 5kg", qty: 1, price: 620, lineTotal: 620 }],
  subtotal: 620,
  total: 620,
};

const format = (over: Partial<ReceiptFormatSettings> = {}): ReceiptFormatSettings => ({ ...DEFAULT_THERMAL_FORMAT, ...over });

/** Does the byte stream contain this exact command sequence? */
function has(bytes: Uint8Array, seq: number[]) {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

const ESC = 0x1b;
const GS = 0x1d;

describe("Bluetooth (ESC/POS) receipt honours the settings it can send", () => {
  it("sends bold on/off and turns bold off again", () => {
    const bytes = buildReceiptEscPos(receipt, 32, format({ shopNameBold: true }));
    expect(has(bytes, [ESC, 0x45, 1])).toBe(true);
    expect(has(bytes, [ESC, 0x45, 0])).toBe(true);
  });

  it("no bold at all when every bold is off and sizes are Normal", () => {
    const plain = format({ shopNameBold: false, shopNameSize: 1, itemsBold: false, totalBold: false, totalSize: 1 });
    expect(has(buildReceiptEscPos(receipt, 32, plain), [ESC, 0x45, 1])).toBe(false);
  });

  it("item-table bold changes the output", () => {
    const off = buildReceiptEscPos(receipt, 32, format({ itemsBold: false }));
    const on = buildReceiptEscPos(receipt, 32, format({ itemsBold: true }));
    expect(Array.from(on)).not.toEqual(Array.from(off));
  });

  it("sends the shop-name and total alignment", () => {
    const left = buildReceiptEscPos(receipt, 32, format({ shopNameAlign: "left" }));
    const right = buildReceiptEscPos(receipt, 32, format({ shopNameAlign: "right" }));
    expect(has(left, [ESC, 0x61, 0])).toBe(true);
    expect(has(right, [ESC, 0x61, 2])).toBe(true);
    const centeredTotal = buildReceiptEscPos(receipt, 32, format({ totalAlign: "center" }));
    expect(has(centeredTotal, [ESC, 0x61, 1])).toBe(true);
  });

  it("never sends size or italic commands (they made some printers print a stray '5')", () => {
    for (const size of [0, 1, 4, 7]) {
      for (const italic of [false, true]) {
        const bytes = buildReceiptEscPos(receipt, 32, format({ shopNameSize: size, totalSize: size, shopNameItalic: italic, totalItalic: italic }));
        expect(has(bytes, [GS, 0x21]), `GS ! at size ${size}`).toBe(false);
        expect(has(bytes, [ESC, 0x21]), `ESC ! at size ${size}`).toBe(false);
        expect(has(bytes, [ESC, 0x4d]), `ESC M at size ${size}`).toBe(false);
        expect(has(bytes, [ESC, 0x34]), "ESC 4").toBe(false);
        expect(has(bytes, [ESC, 0x35]), "ESC 5").toBe(false);
      }
    }
  });
});

const thermalData: ThermalReceiptData = {
  shopName: "Sharma Store",
  invoiceNumber: "2026-27/00042",
  dateText: "26 Sept 2026",
  placeOfSupplyText: "Same state (CGST + SGST)",
  items: [{ name: "Rice 5kg", qty: 1, rate: 620, amount: 620 }],
  subtotal: 620,
  taxableAmount: 590.48,
  isIntraState: true,
  total: 620,
  paidAmount: 620,
  paymentLabel: "Cash",
};
const html = (f: Partial<ThermalFormat>) => renderToStaticMarkup(createElement(ThermalRenderer, { data: thermalData, paperWidth: 58, format: { ...DEFAULT_THERMAL_FORMAT, ...f } }));

describe("Browser / USB receipt honours every setting", () => {
  it("shop-name size grows with the chosen level", () => {
    expect(html({ shopNameSize: 1 })).toContain("font-size:1em");
    expect(html({ shopNameSize: 4 })).toContain("font-size:2em");
    expect(sizeEm(99)).toBe(sizeEm(7));
    expect(sizeEm(-3)).toBe(sizeEm(0));
  });

  it("italic and bold apply to the shop name", () => {
    const italicBold = html({ shopNameItalic: true, shopNameBold: true });
    expect(italicBold).toContain("font-style:italic");
    expect(italicBold).toContain("font-weight:700");
    const plain = html({ shopNameItalic: false, shopNameBold: false, totalBold: false });
    expect(plain).not.toContain("font-style:italic");
  });

  it("shop-name alignment is applied", () => {
    expect(html({ shopNameAlign: "right" })).toContain("text-align:right");
    expect(html({ shopNameAlign: "left" })).toContain("text-align:left");
  });

  it("item-table bold wraps the item rows", () => {
    expect(html({ itemsBold: true })).toContain("font-weight:700");
    const off = html({ itemsBold: false, shopNameBold: false, totalBold: false });
    expect(off).not.toContain("font-weight:700");
  });

  it("total: left aligned splits label and amount, centred is one line, size is applied", () => {
    const left = html({ totalAlign: "left", totalSize: 3 });
    expect(left).toContain("justify-between");
    expect(left).toContain("font-size:1.6em");
    const centre = html({ totalAlign: "center" });
    expect(centre).toContain("TOTAL Rs.620.00");
  });
});

describe("thermalFormatFor", () => {
  const saved = {
    t58ShopNameBold: true, t58ShopNameItalic: true, t58ShopNameSize: 4, t58ShopNameAlign: "left" as const,
    t58ItemsBold: true, t58TotalBold: false, t58TotalItalic: false, t58TotalSize: 5, t58TotalAlign: "right" as const,
    t80ShopNameBold: false, t80ShopNameItalic: false, t80ShopNameSize: 1, t80ShopNameAlign: "center" as const,
    t80ItemsBold: false, t80TotalBold: true, t80TotalItalic: true, t80TotalSize: 2, t80TotalAlign: "center" as const,
  };
  it("picks the right paper's settings", () => {
    expect(thermalFormatFor(saved, 58).shopNameSize).toBe(4);
    expect(thermalFormatFor(saved, 58).totalAlign).toBe("right");
    expect(thermalFormatFor(saved, 80).shopNameSize).toBe(1);
    expect(thermalFormatFor(saved, 80).totalItalic).toBe(true);
  });
});
