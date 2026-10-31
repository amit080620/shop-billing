import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bluetooth-print", () => ({ shouldDefaultToBluetooth: () => false }));
const { escPosLines } = await import("../../app/print/bill/[id]/ThermalScreen");
const { buildReceiptEscPos } = await import("../escpos");

describe("phone preview of the printed receipt", () => {
  const receipt = {
    shopName: "Amit resto",
    shopAddress: "Hadapsar Road, Pune",
    gstin: "27AAAAP0267H2ZN",
    isComposition: true,
    invoiceNumber: "2026-27/00159",
    dateText: "29/10/2026",
    timeText: "11:57 am",
    paymentLabel: "UPI",
    items: [{ name: "Rabdi", qty: 1, price: 70, lineTotal: 70 }],
    subtotal: 70,
    taxableAmount: 70,
    isIntraState: true,
    total: 70,
    paidAmount: 70,
  };
  const lines = escPosLines(buildReceiptEscPos(receipt, 32));

  it("shows the printer's own lines, each a full 32 characters or less", () => {
    expect(lines[0]).toEqual({ text: "BILL OF SUPPLY", align: "center", bold: false });
    expect(lines.every((l) => l.text.length <= 32)).toBe(true);
    expect(lines.some((l) => /^Rabdi\s+1\s+70\.00\s+70\.00$/.test(l.text))).toBe(true);
  });

  it("marks bold only the lines printed bold (the shop name, the total)", () => {
    expect(lines.find((l) => l.text === "Amit resto")?.bold).toBe(true);
    expect(lines.find((l) => l.text.startsWith("Hadapsar"))?.bold).toBe(false);
    expect(lines.find((l) => l.text.startsWith("TOTAL"))?.bold).toBe(true);
    expect(lines.at(-1)?.text.trim()).toBe("Thank you! Visit again");
  });

  it("a bill that took no money says Udhaar, with only the balance due — no \"Paid (…): 0.00\"", () => {
    const udhaar = escPosLines(buildReceiptEscPos({ ...receipt, customerName: "Sanjay Iyer", paymentLabel: "Udhaar", paidAmount: 0, creditAmount: 70 }, 32));
    expect(udhaar.some((l) => l.text.includes("Payment: Udhaar"))).toBe(true);
    expect(udhaar.some((l) => /^Balance due \(Udhaar\):\s+70\.00$/.test(l.text.trim()))).toBe(true);
    expect(udhaar.some((l) => l.text.trim().startsWith("Paid"))).toBe(false);
  });

  it("part paid: the paid line stays, with its mode", () => {
    const part = escPosLines(buildReceiptEscPos({ ...receipt, paidAmount: 50, creditAmount: 20 }, 32));
    expect(part.some((l) => /^Paid \(UPI\):\s+50\.00$/.test(l.text.trim()))).toBe(true);
    expect(part.some((l) => /^Balance due \(Udhaar\):\s+20\.00$/.test(l.text.trim()))).toBe(true);
  });
});
