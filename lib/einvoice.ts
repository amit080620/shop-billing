// Government JSON for B2B bills: the e-invoice (IRP schema INV-01, v1.1) — uploaded on the IRP /
// e-invoice portal's bulk tool to get the IRN — and the e-way bill (the EWB portal's bulk-generation
// format). No GSP account needed: the shop uploads the file itself. Pure, so the page and the tests agree.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Our units → the GST portal's UQC codes. */
const UQC: Record<string, string> = {
  NOS: "NOS", PC: "PCS", PCS: "PCS", KG: "KGS", KGS: "KGS", G: "GMS", GM: "GMS", GRAM: "GMS", GMS: "GMS", LTR: "LTR", L: "LTR", ML: "MLT", MTR: "MTR", M: "MTR",
  BAG: "BAG", BOX: "BOX", BTL: "BTL", PKT: "PAC", PACK: "PAC", SET: "SET", PAIR: "PRS", DOZEN: "DOZ", DOZ: "DOZ", ROLL: "ROL", BUNDLE: "BDL", CTN: "CTN", CARTON: "CTN",
  TON: "TON", QTL: "QTL", THOUSAND: "THD", CAN: "CAN", DRUM: "DRM", TUBE: "TUB", SQFT: "SQF", SQM: "SQM", UNIT: "UNT", PLATE: "NOS", GLASS: "NOS",
};
export const uqc = (unit: string | null | undefined) => UQC[(unit ?? "").trim().toUpperCase()] ?? "OTH";

/** A 6-digit PIN code inside an address, if there is one. */
export const pinFrom = (text: string | null | undefined) => Number((text ?? "").match(/\b([1-9]\d{5})\b/)?.[1] ?? 0) || null;

export type Party = { gstin: string; name: string; address: string; place: string; pin: number | null; stateCode: string; phone?: string | null };
export type Line = { name: string; hsn: string | null; qty: number; unit: string; gstPercent: number; taxable: number; cgst: number; sgst: number; igst: number };
export type Invoice = { number: string; date: string; seller: Party; buyer: Party; lines: Line[]; total: number };

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isService = (hsn: string | null) => !!hsn && hsn.startsWith("99");
const addr = (s: string) => {
  const a = s.replace(/\s+/g, " ").trim();
  return a.length >= 3 ? a.slice(0, 100) : "-  ";
};

/** What must be fixed before the portal will accept the bill (empty when it is ready). */
export function einvoiceProblems(inv: Invoice): string[] {
  const out: string[] = [];
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(inv.seller.gstin)) out.push("Your shop's GSTIN is missing or wrong (Settings).");
  if (!inv.seller.pin) out.push("Your shop's PIN code is missing (Settings).");
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(inv.buyer.gstin)) out.push("The buyer's GSTIN is missing or wrong.");
  if (!inv.buyer.pin) out.push("The buyer's PIN code is missing — add it to their address.");
  if (inv.lines.some((l) => !l.hsn || !/^\d{4,8}$/.test(l.hsn))) out.push("An item has no HSN / SAC code.");
  return out;
}

export function buildEinvoice(inv: Invoice) {
  const items = inv.lines.map((l, i) => {
    const unitPrice = l.qty > 0 ? r2(l.taxable / l.qty) : r2(l.taxable);
    return {
      SlNo: String(i + 1),
      PrdDesc: l.name.slice(0, 300),
      IsServc: isService(l.hsn) ? "Y" : "N",
      HsnCd: l.hsn ?? "",
      Qty: l.qty,
      Unit: uqc(l.unit),
      UnitPrice: unitPrice,
      TotAmt: r2(l.taxable),
      Discount: 0,
      AssAmt: r2(l.taxable),
      GstRt: l.gstPercent,
      IgstAmt: r2(l.igst),
      CgstAmt: r2(l.cgst),
      SgstAmt: r2(l.sgst),
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: r2(l.taxable + l.cgst + l.sgst + l.igst),
    };
  });
  const ass = r2(items.reduce((s, i) => s + i.AssAmt, 0));
  const cgst = r2(items.reduce((s, i) => s + i.CgstAmt, 0));
  const sgst = r2(items.reduce((s, i) => s + i.SgstAmt, 0));
  const igst = r2(items.reduce((s, i) => s + i.IgstAmt, 0));
  const party = (p: Party, buyer: boolean) => ({
    Gstin: p.gstin,
    LglNm: p.name.slice(0, 100),
    ...(buyer ? { Pos: p.stateCode } : {}),
    Addr1: addr(p.address),
    Loc: addr(p.place),
    Pin: p.pin,
    Stcd: p.stateCode,
    ...(p.phone && /^\d{6,12}$/.test(p.phone) ? { Ph: p.phone } : {}),
  });
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: inv.number.slice(0, 16), Dt: ddmmyyyy(inv.date) },
    SellerDtls: party(inv.seller, false),
    BuyerDtls: party(inv.buyer, true),
    ItemList: items,
    ValDtls: { AssVal: ass, CgstVal: cgst, SgstVal: sgst, IgstVal: igst, CesVal: 0, StCesVal: 0, Discount: 0, OthChrg: 0, RndOffAmt: r2(inv.total - (ass + cgst + sgst + igst)), TotInvVal: r2(inv.total) },
  };
}

/** One bill in the e-way bill portal's bulk format (Part A; the vehicle can be added on the portal). */
export function buildEwayBill(inv: Invoice) {
  const goods = inv.lines.filter((l) => !isService(l.hsn));
  const byValue = [...goods].sort((a, b) => b.taxable - a.taxable);
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst") => r2(goods.reduce((s, l) => s + l[k], 0));
  return {
    userGstin: inv.seller.gstin,
    supplyType: "O",
    subSupplyType: 1,
    subSupplyDesc: "",
    docType: "INV",
    docNo: inv.number.slice(0, 16),
    docDate: ddmmyyyy(inv.date),
    transType: 1,
    fromGstin: inv.seller.gstin,
    fromTrdName: inv.seller.name.slice(0, 100),
    fromAddr1: addr(inv.seller.address),
    fromAddr2: "",
    fromPlace: addr(inv.seller.place),
    fromPincode: inv.seller.pin,
    fromStateCode: Number(inv.seller.stateCode),
    actualFromStateCode: Number(inv.seller.stateCode),
    toGstin: inv.buyer.gstin,
    toTrdName: inv.buyer.name.slice(0, 100),
    toAddr1: addr(inv.buyer.address),
    toAddr2: "",
    toPlace: addr(inv.buyer.place),
    toPincode: inv.buyer.pin,
    toStateCode: Number(inv.buyer.stateCode),
    actualToStateCode: Number(inv.buyer.stateCode),
    totalValue: sum("taxable"),
    cgstValue: sum("cgst"),
    sgstValue: sum("sgst"),
    igstValue: sum("igst"),
    cessValue: 0,
    TotNonAdvolVal: 0,
    OthValue: 0,
    totInvValue: r2(inv.total),
    transMode: 1,
    // 0 lets the portal work the distance out from the two PIN codes.
    transDistance: 0,
    transporterName: "",
    transporterId: "",
    transDocNo: "",
    transDocDate: "",
    vehicleNo: "",
    vehicleType: "R",
    mainHsnCode: Number(byValue[0]?.hsn ?? 0),
    itemList: goods.map((l, i) => ({
      itemNo: i + 1,
      productName: l.name.slice(0, 100),
      productDesc: l.name.slice(0, 100),
      hsnCode: Number(l.hsn ?? 0),
      quantity: l.qty,
      qtyUnit: uqc(l.unit),
      taxableAmount: r2(l.taxable),
      sgstRate: l.sgst > 0 ? l.gstPercent / 2 : 0,
      cgstRate: l.cgst > 0 ? l.gstPercent / 2 : 0,
      igstRate: l.igst > 0 ? l.gstPercent : 0,
      cessRate: 0,
      cessNonAdvol: 0,
    })),
  };
}

/** Goods worth over ₹50,000 on the bill need an e-way bill before they move. */
export const needsEwayBill = (inv: Invoice) => inv.lines.filter((l) => !isService(l.hsn)).reduce((s, l) => s + l.taxable + l.cgst + l.sgst + l.igst, 0) > 50000;
