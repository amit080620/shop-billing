import { describe, expect, it } from "vitest";
import { paidByMode, paymentSummary } from "../billPaymentSplit";
import { buildTallyXml, saleEntries } from "../tally";
import { splitProblem, splitSum, splitToSend } from "../../app/components/SplitPayments";

const sum = (e: { amount: number }[]) => Math.round(e.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe("paidByMode", () => {
  it("a bill with no rows counts all its paid amount in its one mode", () => {
    expect(paidByMode(500, "upi", undefined)).toEqual([{ method: "upi", amount: 500 }]);
    expect(paidByMode(500, "upi", [])).toEqual([{ method: "upi", amount: 500 }]);
  });
  it("each row in its own mode, the non-money rest in the main mode, adding up to paid", () => {
    const out = paidByMode(1000, "cash", [{ method: "cash", amount: 300 }, { method: "upi", amount: 500 }]);
    expect(out).toEqual([{ method: "cash", amount: 300 }, { method: "upi", amount: 500 }, { method: "cash", amount: 200 }]);
    expect(sum(out)).toBe(1000);
  });
  it("rows that explain all of paid add nothing more", () => {
    expect(paidByMode(800, "upi", [{ method: "cash", amount: 300 }, { method: "upi", amount: 500 }])).toHaveLength(2);
  });
});

describe("split on the invoice", () => {
  it("shows every mode with its amount", () => {
    expect(paymentSummary([{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }], "upi")).toBe("Cash ₹10.00 + UPI ₹90.00");
    expect(paymentSummary([{ method: "online", amount: 5 }], "cash")).toBe("Bank Transfer / Online");
  });
});

describe("split in Tally", () => {
  const sale = { number: "INV/9", date: "2026-10-31", party: null, method: "upi", byRate: [{ rate: 0, taxable: 1000 }], taxable: 1000, cgst: 0, sgst: 0, igst: 0, total: 1000, paid: 1000 };
  it("a counter sale paid cash + UPI debits both Cash and Bank, balanced", () => {
    const e = saleEntries({ ...sale, paidBy: [{ method: "cash", amount: 400 }, { method: "upi", amount: 600 }] });
    expect(e.find((x) => x.ledger === "Cash")!.amount).toBe(-400);
    expect(e.find((x) => x.ledger === "Bank (UPI / Card)")!.amount).toBe(-600);
    expect(sum(e)).toBe(0);
  });
  it("a party's receipt is split between Cash and Bank", () => {
    const { vouchers } = buildTallyXml({ sales: [{ ...sale, party: "Ramesh", paid: 700, paidBy: [{ method: "cash", amount: 200 }, { method: "card", amount: 500 }] }], receipts: [], purchases: [], payments: [], parties: [{ name: "Ramesh", group: "Sundry Debtors", gstin: null, state: null }] });
    const receipt = vouchers.slice(vouchers.indexOf('VCHTYPE="Receipt"'));
    expect(receipt).toContain("<LEDGERNAME>Cash</LEDGERNAME>");
    expect(receipt).toContain("<LEDGERNAME>Bank (UPI / Card)</LEDGERNAME>");
  });
});

describe("split rows on screen", () => {
  const rows = [{ method: "cash" as const, amount: 300, reference: "" }, { method: "upi" as const, amount: "" as const, reference: " " }, { method: "upi" as const, amount: 500, reference: " UTR1 " }];
  it("adds only filled rows and sends only those above 0", () => {
    expect(splitSum(rows)).toBe(800);
    expect(splitToSend(rows)).toEqual([{ method: "cash", amount: 300 }, { method: "upi", amount: 500, reference: "UTR1" }]);
  });
  it("refuses more than the bill, and unpaid money on a walk-in bill", () => {
    expect(splitProblem(rows, 700, true)).toMatch(/more than the bill/);
    expect(splitProblem(rows, 1000, false)).toMatch(/unpaid/);
    expect(splitProblem(rows, 1000, true)).toBeNull();
    expect(splitProblem(rows, 800, false)).toBeNull();
  });
});
