import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReceiptEscPos, type ReceiptData } from "../escpos";
import { ThermalRenderer, type ThermalReceiptData } from "../print/ThermalRenderer";
import { DEFAULT_THERMAL_FORMAT } from "../print/thermalFormat";
import { RECEIPT_FIELDS, cleanHidden } from "../print/receiptFields";

const printed = (r: ReceiptData, hidden: string[]) => String.fromCharCode(...buildReceiptEscPos(r, 48, { ...DEFAULT_THERMAL_FORMAT, hidden }));
const screen = (d: ThermalReceiptData, hidden: string[]) => renderToStaticMarkup(createElement(ThermalRenderer, { data: d, paperWidth: 80, format: { ...DEFAULT_THERMAL_FORMAT, hidden } }));

const receipt: ReceiptData = {
  shopName: "Sharma Store", shopAddress: "Main Road, Pune", gstin: "27ABCDE1234F1Z5", invoiceNumber: "2026-27/00042", dateText: "26/09/2026", timeText: "4:12 pm",
  customerName: "Rahul", customerPhone: "9876543210", paymentLabel: "UPI",
  items: [{ name: "Rice", qty: 2, price: 50, lineTotal: 100, gstPercent: 5, taxAmount: 4.76 }],
  subtotal: 100, discount: 5, taxableAmount: 90.48, isIntraState: true, cgstAmount: 2.38, sgstAmount: 2.38, total: 95, paidAmount: 95, footerText: "Open 24x7",
};
const data: ThermalReceiptData = {
  shopName: "Sharma Store", shopAddress: "Main Road, Pune", gstin: "27ABCDE1234F1Z5", invoiceNumber: "2026-27/00042", dateText: "26/09/2026", timeText: "4:12 pm",
  customerName: "Rahul", customerPhone: "9876543210", placeOfSupplyText: "Place: Maharashtra (CGST + SGST)",
  items: [{ name: "Rice", qty: 2, rate: 50, amount: 100, gstPercent: 5, taxAmount: 4.76 }],
  subtotal: 100, discountAmount: 5, taxableAmount: 90.48, isIntraState: true, cgstAmount: 2.38, sgstAmount: 2.38, total: 95, paidAmount: 95, paymentLabel: "UPI",
  footerText: "Open 24x7", termsAndConditions: "No returns",
};

describe("show or hide parts of the receipt", () => {
  it("prints everything when nothing is hidden", () => {
    for (const text of ["TAX INVOICE", "Main Road, Pune", "GSTIN: 27ABCDE1234F1Z5", "Mobile: 9876543210", "Payment: UPI", "Discount:", "CGST:", "Rupees Ninety Five Only", "E.&O.E.", "Open 24x7", "Thank you! Visit again"]) {
      expect(printed(receipt, []), text).toContain(text);
    }
  });

  it("leaves out each hidden part, on the printer and on the screen", () => {
    const hidden = ["title", "address", "mobile", "payment", "discount", "taxLines", "amountWords", "eoe", "footer", "thankYou", "terms", "place"];
    const p = printed(receipt, hidden);
    for (const gone of ["TAX INVOICE", "Main Road", "Mobile:", "Payment:", "Discount:", "CGST:", "Rupees", "E.&O.E.", "Open 24x7", "Thank you"]) expect(p, gone).not.toContain(gone);
    expect(p).toContain("Sharma Store");
    expect(p).toContain("TOTAL");
    const h = screen(data, hidden);
    for (const gone of ["TAX INVOICE", "Main Road", "9876543210", "Payment:", "CGST:", "Rupees", "E.&amp;O.E.", "Open 24x7", "Thank you", "No returns", "Place:"]) expect(h, gone).not.toContain(gone);
    expect(h).toContain("Sharma Store");
  });

  it("keeps the columns in place when Qty or Rate is hidden", () => {
    const line = printed(receipt, ["qty", "rate"]).split("\n").find((l) => l.startsWith("Rice"))!;
    expect(line.trimEnd().endsWith("100.00")).toBe(true);
    expect(line).not.toContain("50.00");
  });

  it("keeps only known parts in a stored list", () => {
    expect(cleanHidden(["title", "nonsense", "title", 3])).toEqual(["title"]);
    expect(cleanHidden(null)).toEqual([]);
    expect(new Set(RECEIPT_FIELDS.map((f) => f.key)).size).toBe(RECEIPT_FIELDS.length);
  });
});
