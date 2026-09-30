import { describe, expect, it } from "vitest";
import { buildTallyXml, purchaseEntries, saleEntries, splitByRate } from "../tally";

const sum = (e: { amount: number }[]) => Math.round(e.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe("splitByRate", () => {
  it("spreads a bill discount over the rates, adding up to the taxable value", () => {
    const out = splitByRate([{ rate: 18, taxable: 1000 }, { rate: 5, taxable: 500 }, { rate: 18, taxable: 200 }], 1530);
    expect(out.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(1530, 2);
    expect(out.find((l) => l.rate === 18)!.amount).toBe(1080);
  });
});

describe("vouchers balance", () => {
  const sale = { number: "INV/1", date: "2026-09-30", party: "Ramesh Traders", method: "upi", byRate: [{ rate: 18, taxable: 847.46 }], taxable: 847.46, cgst: 76.27, sgst: 76.27, igst: 0, total: 1000, paid: 400 };
  it("a sale: party debit equals sales + tax + round off", () => {
    const e = saleEntries(sale);
    expect(sum(e)).toBe(0);
    expect(e[0]).toEqual({ ledger: "Ramesh Traders", amount: -1000 });
    expect(e.find((x) => x.ledger === "Round Off")!.amount).toBe(0);
  });
  it("a counter sale goes to Cash or Bank", () => {
    expect(saleEntries({ ...sale, party: null, method: "cash" })[0].ledger).toBe("Cash");
    expect(saleEntries({ ...sale, party: null, method: "card" })[0].ledger).toBe("Bank (UPI / Card)");
  });
  it("a purchase: vendor credit equals purchase + tax + round off", () => {
    const e = purchaseEntries({ ...sale, party: "Apex Distributors", cgst: 76.28, total: 1000.5 });
    expect(sum(e)).toBe(0);
    expect(e.find((x) => x.ledger === "Apex Distributors")!.amount).toBe(1000.5);
  });
});

describe("buildTallyXml", () => {
  it("creates each ledger once, and receipts for what was paid", () => {
    const { masters, vouchers } = buildTallyXml({
      parties: [{ name: "Ramesh & Sons", group: "Sundry Debtors", gstin: "27AAAAA0000A1Z5", state: "Maharashtra" }],
      sales: [
        { number: "INV/1", date: "2026-09-30", party: "Ramesh & Sons", method: "cash", byRate: [{ rate: 18, taxable: 100 }], taxable: 100, cgst: 9, sgst: 9, igst: 0, total: 118, paid: 118 },
        { number: "INV/2", date: "2026-09-30", party: null, method: "upi", byRate: [{ rate: 18, taxable: 50 }], taxable: 50, cgst: 4.5, sgst: 4.5, igst: 0, total: 59, paid: 59 },
      ],
      receipts: [],
      purchases: [],
      payments: [],
    });
    expect(masters.match(/LEDGER NAME="Sales @ 18%"/g)).toHaveLength(1);
    expect(masters).toContain("Ramesh &amp; Sons");
    expect(masters).toContain("<PARTYGSTIN>27AAAAA0000A1Z5</PARTYGSTIN>");
    expect(vouchers.match(/VCHTYPE="Sales"/g)).toHaveLength(2);
    expect(vouchers.match(/VCHTYPE="Receipt"/g)).toHaveLength(1);
    expect(vouchers).toContain("<DATE>20260930</DATE>");
  });
});
