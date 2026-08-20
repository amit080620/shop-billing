import { THERMAL_58_DEFAULT, THERMAL_80_DEFAULT, type ThermalPrinterProfile } from "./printerProfile";
import { buildItemRowLines, buildHeaderRow, buildTwoColumnRow, buildDivider } from "./textGrid";

export type ThermalReceiptItem = {
  name: string;
  qty: number;
  rate: number;
  amount: number;
  mrp?: number | null;
  warrantyText?: string | null;
};

export type ThermalReceiptData = {
  shopName: string;
  gstin?: string | null;
  invoiceNumber: string;
  dateText: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  serviceProviderName?: string | null;
  placeOfSupplyText: string;
  items: ThermalReceiptItem[];
  savingsOffMrp?: number;
  subtotal: number;
  discountLabel?: string | null;
  discountAmount?: number;
  taxableAmount: number;
  isIntraState: boolean;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  roundOffAmount?: number;
  total: number;
  paidAmount: number;
  paymentLabel: string;
  creditAmount?: number;
  tagline?: string | null;
  bankDetails?: string | null;
  termsAndConditions?: string | null;
  footerText?: string | null;
  voidedBanner?: string | null;
};

function money(n: number): string {
  return n.toFixed(2);
}

/** Genuinely renders line-by-line from the character-grid functions —
 * every row below is built to an exact fixed width first, THEN
 * displayed, rather than relying on CSS/flexbox to align numbers,
 * which is what let a long item name silently misalign the amount
 * column in the old shared-template approach. */
export function ThermalRenderer({
  data,
  paperWidth,
}: {
  data: ThermalReceiptData;
  paperWidth: 58 | 80;
}) {
  const profile: ThermalPrinterProfile = paperWidth === 58 ? THERMAL_58_DEFAULT : THERMAL_80_DEFAULT;
  const lines: string[] = [];

  lines.push(buildHeaderRow(profile));
  lines.push(buildDivider(profile));
  for (const item of data.items) {
    if (item.mrp != null && item.mrp > item.rate) {
      lines.push(`  MRP Rs.${money(item.mrp)}`);
    }
    lines.push(...buildItemRowLines(item.name, String(item.qty), money(item.rate), money(item.amount), profile));
    if (item.warrantyText) lines.push(`  ${item.warrantyText}`);
  }
  lines.push(buildDivider(profile));

  if (data.savingsOffMrp && data.savingsOffMrp > 0) {
    lines.push(buildTwoColumnRow("You saved (off MRP)", `Rs.${money(data.savingsOffMrp)}`, profile));
  }
  lines.push(buildTwoColumnRow("Sub Total", `Rs.${money(data.subtotal)}`, profile));
  if (data.discountAmount && data.discountAmount > 0) {
    lines.push(buildTwoColumnRow(data.discountLabel ?? "Discount", `- Rs.${money(data.discountAmount)}`, profile));
  }
  lines.push(buildTwoColumnRow("Taxable Value", `Rs.${money(data.taxableAmount)}`, profile));
  if (data.isIntraState) {
    if (data.cgstAmount) lines.push(buildTwoColumnRow("CGST", `+ Rs.${money(data.cgstAmount)}`, profile));
    if (data.sgstAmount) lines.push(buildTwoColumnRow("SGST", `+ Rs.${money(data.sgstAmount)}`, profile));
  } else if (data.igstAmount) {
    lines.push(buildTwoColumnRow("IGST", `+ Rs.${money(data.igstAmount)}`, profile));
  }
  if (data.roundOffAmount && Math.abs(data.roundOffAmount) > 0.001) {
    const sign = data.roundOffAmount > 0 ? "+" : "-";
    lines.push(buildTwoColumnRow("Round Off", `${sign} Rs.${money(Math.abs(data.roundOffAmount))}`, profile));
  }
  lines.push(buildDivider(profile));

  const paidLine = buildTwoColumnRow(`Paid (${data.paymentLabel})`, `Rs.${money(data.paidAmount)}`, profile);
  const creditLine =
    data.creditAmount && data.creditAmount > 0
      ? buildTwoColumnRow("Credit (Udhaar)", `Rs.${money(data.creditAmount)}`, profile)
      : null;

  return (
    <div
      className="bg-white text-black"
      style={{
        width: paperWidth === 58 ? "190px" : "280px",
        fontFamily: 'ui-monospace, "SFMono-Regular", "Courier New", Courier, monospace',
        fontSize: paperWidth === 58 ? "10.5px" : "11.5px",
        lineHeight: 1.35,
        whiteSpace: "pre",
        padding: "6px 4px",
      }}
    >
      {data.voidedBanner && (
        <div className="mb-1 text-center font-bold" style={{ letterSpacing: "2px" }}>
          *** {data.voidedBanner} ***
        </div>
      )}

      <div className="text-center font-bold" style={{ fontSize: "1.25em" }}>
        {data.shopName}
      </div>
      {data.tagline && <div className="text-center">{data.tagline}</div>}
      {data.gstin && <div className="text-center">GSTIN: {data.gstin}</div>}
      <div className="text-center">{buildDivider(profile, "=")}</div>

      <div>{buildTwoColumnRow("Bill No:", data.invoiceNumber, profile)}</div>
      <div>{data.dateText}</div>
      {data.customerName && <div>Bill To: {data.customerName}</div>}
      {data.serviceProviderName && <div>Stylist: {data.serviceProviderName}</div>}
      {data.customerPhone && <div>{data.customerPhone}</div>}
      {data.customerGstin && <div>GSTIN: {data.customerGstin}</div>}
      <div>{data.placeOfSupplyText}</div>
      <div>{buildDivider(profile)}</div>

      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}

      <div className="mt-1 text-center font-bold" style={{ fontSize: "1.15em" }}>
        {buildTwoColumnRow("TOTAL RS", `Rs.${money(data.total)}`, profile)}
      </div>
      <div>{paidLine}</div>
      {creditLine && <div className="font-bold">{creditLine}</div>}

      {data.bankDetails && (
        <>
          <div>{buildDivider(profile)}</div>
          {data.bankDetails.split("\n").map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </>
      )}

      {data.termsAndConditions && (
        <>
          <div className="mt-1">{buildDivider(profile)}</div>
          {data.termsAndConditions.split("\n").map((l, i) => (
            <div key={i} style={{ fontSize: "0.85em" }}>
              {l}
            </div>
          ))}
        </>
      )}

      <div className="mt-1 text-center">E.&amp;O.E.</div>
      <div className="text-center">{data.footerText || "THANK YOU *** VISIT AGAIN!"}</div>
    </div>
  );
}
