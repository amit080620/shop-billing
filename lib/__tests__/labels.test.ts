import { describe, expect, it } from "vitest";
import { LABEL_PRESETS, buildLabelTspl, labelPriceLine, labelRows, rowWidthMm, type LabelItem } from "../labels";

const item: LabelItem = { name: "Spring Days", price: 139, mrp: 139, unit: "pcs", code: "106464" };
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** Every TEXT / BARCODE on the page, with where it starts and how wide and tall it is, in dots. */
function boxes(program: string) {
  const fonts: Record<string, [number, number]> = { "1": [8, 12], "2": [12, 20], "3": [16, 24], "4": [24, 32] };
  return program.split("\r\n").flatMap((line) => {
    const t = line.match(/^TEXT (\d+),(\d+),"(\d)",0,1,1,"(.*)"$/);
    if (t) return [{ x: +t[1], y: +t[2], w: t[4].length * fonts[t[3]][0], h: fonts[t[3]][1] }];
    const b = line.match(/^BARCODE (\d+),(\d+),"128M",(\d+),0,0,(\d),\d,"!104(.*)"$/);
    if (b) return [{ x: +b[1], y: +b[2], w: (11 * b[5].length + 35) * +b[4], h: +b[3] }];
    return [];
  });
}

describe("barcode stickers (TSPL)", () => {
  it("prints exactly the stickers asked for, filling rows left to right", () => {
    const p = text(buildLabelTspl([item, item, item], "S.S Mart", LABEL_PRESETS[0].layout));
    expect(p).toContain("SIZE 102 mm, 25 mm");
    expect(p).toContain("GAP 2 mm, 0 mm");
    // 3 stickers on a 2-across roll: two rows, each printed once.
    expect(p.match(/PRINT 1,1/g)).toHaveLength(2);
    expect(p.match(/BARCODE /g)).toHaveLength(3);
    expect(labelRows([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("puts the second sticker of a row on the right-hand sticker", () => {
    const p = text(buildLabelTspl([item, item], "S.S Mart", LABEL_PRESETS[0].layout));
    const xs = boxes(p).filter((_, i) => i % 5 === 0).map((b) => b.x);
    expect(xs[1] - xs[0]).toBe((50 + 2) * 8);
  });

  it("keeps everything inside the sticker on every roll size", () => {
    for (const { layout, id } of LABEL_PRESETS) {
      const long = { ...item, name: "Container 6 pc 750ml set with lid", code: "8901234567890", mrp: 150, price: 119 };
      const p = text(buildLabelTspl(Array(layout.columns).fill(long), "Shree Hardware & Paints", layout));
      const step = (layout.widthMm + layout.columnGapMm) * 8;
      for (const b of boxes(p)) {
        const col = Math.floor(b.x / step);
        const left = b.x - col * step;
        expect(left + b.w, `${id}: ${JSON.stringify(b)}`).toBeLessThanOrEqual(layout.widthMm * 8);
        expect(b.y + b.h, `${id}: ${JSON.stringify(b)}`).toBeLessThanOrEqual(layout.heightMm * 8);
      }
    }
  });

  it("shows the lower selling price beside the MRP, and only prints what the printer's fonts have", () => {
    const p = text(buildLabelTspl([{ ...item, name: 'Atta "Gold" आटा', mrp: 150, price: 139 }], "Shop", LABEL_PRESETS[2].layout, "both"));
    expect(p).toContain("MRP 150.00  Our 139.00");
    expect(p).toContain('ATTA \\["]GOLD\\["] ???');
    expect(rowWidthMm(LABEL_PRESETS[2].layout)).toBe(50);
  });
});

describe("small stickers", () => {
  it("drop only the .00 of whole rupees to fit the price, never other digits", () => {
    const small = LABEL_PRESETS.find((p) => p.id === "33x22x3")!.layout;
    const p = text(buildLabelTspl([{ ...item, mrp: 1000, price: 999.5 }], "Shop", small, "both"));
    expect(p).toContain("MRP 1000  Our 999.50");
  });
});

describe("price on the sticker", () => {
  const below = { price: 119, mrp: 150 };
  it("shows the MRP alone unless the shop asks for more", () => {
    expect(labelPriceLine(below, "mrp")).toBe("MRP 150.00");
    expect(labelPriceLine(below, "price")).toBe("Price 119.00");
    expect(labelPriceLine(below, "both")).toBe("MRP 150.00  Our 119.00");
    // Sold at MRP, or no MRP saved: one price either way.
    expect(labelPriceLine({ price: 150, mrp: 150 }, "both")).toBe("MRP 150.00");
    expect(labelPriceLine({ price: 99, mrp: null }, "mrp")).toBe("MRP 99.00");
  });
  it("prints MRP alone by default", () => {
    const p = text(buildLabelTspl([{ ...item, ...below }], "Shop", LABEL_PRESETS[0].layout));
    expect(p).toContain('"MRP 150.00"');
    expect(p).not.toContain("Our");
  });
});
