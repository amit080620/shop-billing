import { describe, expect, it } from "vitest";
import { buildEinvoice, buildEwayBill, einvoiceProblems, needsEwayBill, pinFrom, uqc } from "../einvoice";

const seller = { gstin: "27AAAPL1234C1Z5", name: "Shree Hardware", address: "Shop 12, Main Bazaar", place: "Pune", pin: 411001, stateCode: "27", phone: "9000000000" };
const buyer = { gstin: "27AAAPD1001C1Z0", name: "Deshmukh Builders", address: "Sai Nagar, Pune 411045", place: "Pune", pin: 411045, stateCode: "27" };
const inv = {
  number: "2026-27/00123",
  date: "2026-09-30",
  seller,
  buyer,
  lines: [
    { name: "Ultratech Cement 50kg", hsn: "2523", qty: 100, unit: "BAG", gstPercent: 28, taxable: 30859.38, cgst: 4320.31, sgst: 4320.31, igst: 0 },
    { name: "TMT Bar 12mm", hsn: "7214", qty: 400, unit: "KG", gstPercent: 18, taxable: 23050.85, cgst: 2074.58, sgst: 2074.58, igst: 0 },
    { name: "Delivery", hsn: "9965", qty: 1, unit: "NOS", gstPercent: 18, taxable: 847.46, cgst: 76.27, sgst: 76.27, igst: 0 },
  ],
  total: 67700,
};

describe("einvoice", () => {
  it("builds the IRP JSON with totals that add up", () => {
    const e = buildEinvoice(inv);
    expect(e.DocDtls).toEqual({ Typ: "INV", No: "2026-27/00123", Dt: "30/09/2026" });
    expect(e.ItemList[0].Unit).toBe("BAG");
    expect(e.ItemList[1].Unit).toBe("KGS");
    expect(e.ItemList[2].IsServc).toBe("Y");
    const v = e.ValDtls;
    expect(Math.round((v.AssVal + v.CgstVal + v.SgstVal + v.IgstVal + v.RndOffAmt) * 100) / 100).toBe(v.TotInvVal);
    expect(e.BuyerDtls.Pos).toBe("27");
  });

  it("lists what the portal would refuse", () => {
    expect(einvoiceProblems(inv)).toEqual([]);
    const bad = einvoiceProblems({ ...inv, buyer: { ...buyer, gstin: "", pin: null }, lines: [{ ...inv.lines[0], hsn: null }] });
    expect(bad).toHaveLength(3);
  });
});

describe("eway bill", () => {
  it("leaves services out and picks the main HSN by value", () => {
    const w = buildEwayBill(inv);
    expect(w.itemList).toHaveLength(2);
    expect(w.mainHsnCode).toBe(2523);
    expect(w.itemList[0].cgstRate).toBe(14);
    expect(w.transDistance).toBe(0);
  });
  it("is needed only over ₹50,000 of goods", () => {
    expect(needsEwayBill(inv)).toBe(true);
    expect(needsEwayBill({ ...inv, lines: [inv.lines[2]] })).toBe(false);
  });
});

describe("helpers", () => {
  it("maps units and finds a PIN in an address", () => {
    expect(uqc("pkt")).toBe("PAC");
    expect(uqc("STRIP")).toBe("OTH");
    expect(pinFrom("Sai Nagar, Pune 411045")).toBe(411045);
    expect(pinFrom("Pune")).toBeNull();
  });
});
