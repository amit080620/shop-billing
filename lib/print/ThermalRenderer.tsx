import type { CSSProperties, ReactNode } from "react";
import { amountInWords } from "../amountInWords";
import { DEFAULT_THERMAL_FORMAT, sizeEm, type ThermalFormat } from "./thermalFormat";

export type ThermalReceiptItem = {
  name: string;
  qty: number;
  rate: number;
  amount: number;
  /** The item's GST rate, printed in its own column on 80mm paper and summed per rate below the bill. */
  gstPercent?: number | null;
  /** CGST + SGST (or IGST) on this line, for the per-rate GST summary. */
  taxAmount?: number | null;
  mrp?: number | null;
  warrantyText?: string | null;
};

export type ThermalReceiptData = {
  shopName: string;
  shopAddress?: string | null;
  gstin?: string | null;
  /** Same meaning as A4Renderer — no separate tax line items or split on a
   * composition dealer's receipt, per GST law. */
  isComposition?: boolean;
  invoiceNumber: string;
  dateText: string;
  /** When given, the date and the time print on their own lines next to the bill number. */
  timeText?: string | null;
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
  exchangeLabel?: string | null;
  exchangeAmount?: number;
  paidAmount: number;
  paymentLabel: string;
  creditAmount?: number;
  tagline?: string | null;
  bankDetails?: string | null;
  termsAndConditions?: string | null;
  footerText?: string | null;
  voidedBanner?: string | null;
};

const money = (n: number) => n.toFixed(2);
/** 1, 2.5 or 0.25 — never "1.000". */
const qtyText = (n: number) => String(Number(n.toFixed(3)));
const pctText = (n: number) => String(Number(n.toFixed(2)));

/** Thermal printers print black dots only: anything grey or thin breaks up into specks, which is what
 * made the old Courier receipt hard to read. So everything is solid black, in a heavy sans-serif
 * (printers' own fonts are sans too), and lines are solid rules rather than rows of dashes. */
const FONT = 'Arial, "Helvetica Neue", Helvetica, Roboto, "Segoe UI", sans-serif';
const RULE = "1px solid #000";
/** The shop name and the total print a step bigger than the size chosen in settings, against the
 * receipt's own body text, so they stand out the way a counter bill's do. */
export const SHOP_NAME_SCALE = 1.15;
export const TOTAL_SCALE = 1.1;

/** The receipt printed through the browser / USB printer, laid out like a counter POS bill: invoice
 * title, the shop's name, address and GSTIN; customer on the left and bill number, date and time on
 * the right; an item table whose numbers sit under their own headings; the totals stacked at the
 * right with a large grand total; the amount in words; a GST summary per rate; terms; thanks. */
export function ThermalRenderer({
  data,
  paperWidth,
  format = DEFAULT_THERMAL_FORMAT,
}: {
  data: ThermalReceiptData;
  paperWidth: 58 | 80;
  /** The owner's look for the shop name, item table and total (Settings → Thermal print settings). */
  format?: ThermalFormat;
}) {
  const wide = paperWidth === 80;
  const showTax = !data.isComposition && !!data.gstin;
  // The GST% column only fits on 80mm paper; on 58mm the rate shows in the summary below.
  const gstColumn = wide && showTax;
  const itemCount = data.items.length;
  const qtyTotal = data.items.reduce((s, it) => s + it.qty, 0);
  const roundOff = data.roundOffAmount && Math.abs(data.roundOffAmount) > 0.001 ? data.roundOffAmount : 0;
  const summary = showTax ? gstSummary(data.items) : [];

  const cell: CSSProperties = { padding: "1px 0", verticalAlign: "top" };
  const num: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap", paddingLeft: 4 };
  const mid: CSSProperties = { ...cell, textAlign: "center", whiteSpace: "nowrap", paddingLeft: 3 };
  const head: CSSProperties = { fontWeight: 800, borderBottom: RULE, paddingBottom: 2 };

  return (
    <div
      data-thermal-receipt
      style={{
        width: wide ? "280px" : "190px",
        padding: "6px 4px",
        background: "#fff",
        color: "#000",
        fontFamily: FONT,
        fontSize: wide ? "12px" : "11px",
        fontWeight: 600,
        lineHeight: 1.3,
        fontVariantNumeric: "tabular-nums",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {data.voidedBanner && (
        <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 2, border: "2px solid #000", marginBottom: 4 }}>
          *** {data.voidedBanner} ***
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", fontSize: "0.8em", fontWeight: 800, letterSpacing: "0.12em" }}>
        {showTax ? "TAX INVOICE" : data.isComposition ? "BILL OF SUPPLY" : "INVOICE"}
      </div>
      <div
        style={{
          fontSize: `${sizeEm(format.shopNameSize) * SHOP_NAME_SCALE}em`,
          fontWeight: format.shopNameBold ? 700 : 400,
          fontStyle: format.shopNameItalic ? "italic" : "normal",
          textAlign: format.shopNameAlign,
          lineHeight: 1.15,
          margin: "2px 0 1px",
          overflowWrap: "anywhere",
        }}
      >
        {data.shopName}
      </div>
      {data.tagline && <div style={{ textAlign: "center", fontSize: "0.9em" }}>{data.tagline}</div>}
      {data.shopAddress && <div style={{ textAlign: "center", fontSize: "0.9em", textTransform: "uppercase" }}>{data.shopAddress}</div>}
      {data.gstin && <div style={{ textAlign: "center", fontWeight: 800, marginTop: 1 }}>GSTIN: {data.gstin}</div>}
      {data.isComposition && <div style={{ textAlign: "center", fontSize: "0.85em" }}>Composition taxable person, not eligible to collect tax on supplies</div>}

      {/* Customer | bill number, date, time — side by side on 80mm, one under the other on 58mm */}
      <div style={{ borderTop: RULE, borderBottom: RULE, marginTop: 4, padding: "3px 0", display: "flex", flexDirection: wide ? "row" : "column-reverse", gap: wide ? 6 : 2 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Field label="Customer" value={data.customerName || "Cash"} />
          {data.customerPhone && <Field label="Mobile" value={data.customerPhone} />}
          {data.customerGstin && <Field label="GSTIN" value={data.customerGstin} />}
          {data.serviceProviderName && <Field label="Stylist" value={data.serviceProviderName} />}
          <Field label="Payment" value={data.paymentLabel} />
        </div>
        {wide ? (
          <div style={{ flex: "0 0 auto", textAlign: "right", whiteSpace: "nowrap" }}>
            <div>
              Bill No. <b style={{ fontWeight: 800 }}>{data.invoiceNumber}</b>
            </div>
            <div>Date: {data.dateText}</div>
            {data.timeText && <div>Time: {data.timeText}</div>}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
              <span>Bill No.</span>
              <b style={{ fontWeight: 800 }}>{data.invoiceNumber}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
              <span>{data.dateText}</span>
              <span>{data.timeText}</span>
            </div>
          </div>
        )}
      </div>
      {data.placeOfSupplyText && <div style={{ fontSize: "0.85em", padding: "1px 0" }}>{data.placeOfSupplyText}</div>}

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 2, fontWeight: format.itemsBold ? 700 : 600 }}>
        <thead>
          <tr>
            <th style={{ ...cell, ...head, textAlign: "left" }}>{wide ? "S. Description" : "Item"}</th>
            <th style={{ ...mid, ...head }}>Qty</th>
            <th style={{ ...num, ...head }}>Rate</th>
            {gstColumn && <th style={{ ...mid, ...head, paddingLeft: 6 }}>GST%</th>}
            <th style={{ ...num, ...head }}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.items.flatMap((it, i) => {
            const showMrp = it.mrp != null && it.mrp > it.rate;
            const notes = (
              <>
                {showMrp && <Sub>MRP {money(it.mrp!)}</Sub>}
                {it.warrantyText && <Sub>{it.warrantyText}</Sub>}
              </>
            );
            // On 58mm the name column is narrow: a longer name (or one with notes) gets the whole
            // line, and its numbers go on the next line under their headings.
            const ownLine = !wide && (it.name.length > 12 || showMrp || !!it.warrantyText);
            const name = ownLine ? null : (
              <td style={{ ...cell, overflowWrap: "anywhere", paddingTop: 3 }}>
                {wide && <span>{i + 1}. </span>}
                {it.name}
                {notes}
              </td>
            );
            const rows = ownLine
              ? [
                  <tr key={`${i}n`}>
                    <td colSpan={4} style={{ ...cell, overflowWrap: "anywhere", paddingTop: 3 }}>
                      {it.name}
                      {notes}
                    </td>
                  </tr>,
                ]
              : [];
            return [
              ...rows,
              <tr key={i}>
              {name ?? <td style={cell} />}
              <td style={{ ...mid, paddingTop: 3 }}>{qtyText(it.qty)}</td>
              <td style={{ ...num, paddingTop: 3 }}>{money(it.rate)}</td>
              {gstColumn && <td style={{ ...mid, paddingLeft: 6, paddingTop: 3 }}>{it.gstPercent != null ? pctText(it.gstPercent) : ""}</td>}
              <td style={{ ...num, paddingTop: 3 }}>{money(it.amount)}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ borderTop: RULE, marginTop: 3, paddingTop: 3, display: "flex", gap: 6 }}>
        <div style={{ flex: "0 0 auto", fontSize: "0.9em", whiteSpace: "nowrap" }}>
          Items: {itemCount}
          <br />
          Qty: {qtyText(qtyTotal)}
        </div>
        <div style={{ flex: 1 }}>
          <Line label="Sub Total" value={money(data.subtotal)} />
          {data.discountAmount != null && data.discountAmount > 0 && <Line label={data.discountLabel ?? "Discount"} value={`- ${money(data.discountAmount)}`} />}
          {showTax && <Line label="Taxable Value" value={money(data.taxableAmount)} />}
          {showTax && data.isIntraState && !!data.cgstAmount && <Line label="CGST" value={money(data.cgstAmount)} />}
          {showTax && data.isIntraState && !!data.sgstAmount && <Line label="SGST" value={money(data.sgstAmount)} />}
          {showTax && !data.isIntraState && !!data.igstAmount && <Line label="IGST" value={money(data.igstAmount)} />}
          {roundOff !== 0 && <Line label="Round Off" value={`${roundOff > 0 ? "+" : "-"} ${money(Math.abs(roundOff))}`} />}
        </div>
      </div>

      {(() => {
        const style: CSSProperties = {
          fontSize: `${sizeEm(format.totalSize) * TOTAL_SCALE}em`,
          fontWeight: format.totalBold ? 700 : 400,
          fontStyle: format.totalItalic ? "italic" : "normal",
          borderTop: "2px solid #000",
          borderBottom: "2px solid #000",
          marginTop: 3,
          padding: "3px 0",
          lineHeight: 1.2,
        };
        return format.totalAlign === "left" ? (
          <div className="flex justify-between gap-2" style={{ ...style, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>TOTAL</span>
            <span>Rs.{money(data.total)}</span>
          </div>
        ) : (
          <div style={{ ...style, textAlign: format.totalAlign }}>TOTAL Rs.{money(data.total)}</div>
        );
      })()}
      <div style={{ fontSize: "0.9em", padding: "2px 0" }}>{amountInWords(data.total)}</div>

      {data.exchangeLabel && data.exchangeAmount != null && data.exchangeAmount > 0 && <Line label={data.exchangeLabel} value={`- ${money(data.exchangeAmount)}`} />}
      {(data.paidAmount > 0 || !data.exchangeAmount) && <Line label={`Paid (${data.paymentLabel})`} value={money(data.paidAmount)} />}
      {data.creditAmount != null && data.creditAmount > 0 && <Line label="Balance due (Udhaar)" value={money(data.creditAmount)} strong />}

      {data.savingsOffMrp != null && data.savingsOffMrp > 0 && (
        <div style={{ border: RULE, textAlign: "center", fontWeight: 800, margin: "4px 0", padding: "2px 0" }}>
          You saved Rs.{money(data.savingsOffMrp)} on MRP
        </div>
      )}

      {summary.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: "0.85em" }}>
          <thead>
            <tr>
              <th style={{ ...cell, ...head, textAlign: "left" }}>GST%</th>
              <th style={{ ...num, ...head }}>Taxable</th>
              {data.isIntraState ? (
                <>
                  <th style={{ ...num, ...head }}>CGST</th>
                  <th style={{ ...num, ...head }}>SGST</th>
                </>
              ) : (
                <th style={{ ...num, ...head }}>IGST</th>
              )}
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.rate}>
                <td style={cell}>{pctText(r.rate)}%</td>
                <td style={num}>{money(r.taxable)}</td>
                {data.isIntraState ? (
                  <>
                    <td style={num}>{money(r.tax / 2)}</td>
                    <td style={num}>{money(r.tax / 2)}</td>
                  </>
                ) : (
                  <td style={num}>{money(r.tax)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.bankDetails && <Block>{data.bankDetails}</Block>}
      {data.termsAndConditions && (
        <Block>
          <div style={{ fontWeight: 800 }}>Terms &amp; Conditions</div>
          {data.termsAndConditions}
        </Block>
      )}

      <div style={{ borderTop: RULE, marginTop: 4, paddingTop: 3, display: "flex", justifyContent: "space-between", fontSize: "0.85em" }}>
        <span>E.&amp;O.E.</span>
        <span>For {data.shopName}</span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, marginTop: 4 }}>{data.footerText || "Thank you! Visit again"}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      <span style={{ flex: "0 0 auto" }}>{label}:</span>
      <span style={{ fontWeight: 800, overflowWrap: "break-word", minWidth: 0 }}>{value}</span>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontWeight: strong ? 800 : undefined }}>
      <span style={{ textAlign: "right", flex: 1, whiteSpace: "nowrap" }}>{label}:</span>
      <span style={{ minWidth: "4.5em", textAlign: "right", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: "0.85em" }}>{children}</div>;
}

function Block({ children }: { children: ReactNode }) {
  return <div style={{ borderTop: RULE, marginTop: 4, paddingTop: 3, fontSize: "0.85em", whiteSpace: "pre-line" }}>{children}</div>;
}

/** Taxable value and tax per GST rate, from each line's own tax (the taxable part is worked back
 * from the tax, so it holds whether the shop's prices include GST or not). */
export function gstSummary(items: ThermalReceiptItem[]): { rate: number; taxable: number; tax: number }[] {
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const it of items) {
    const rate = Number(it.gstPercent ?? 0);
    const tax = Number(it.taxAmount ?? 0);
    const taxable = rate > 0 ? (tax * 100) / rate : it.amount;
    const r = byRate.get(rate) ?? { taxable: 0, tax: 0 };
    r.taxable += taxable;
    r.tax += tax;
    byRate.set(rate, r);
  }
  if (items.some((it) => it.gstPercent == null)) return [];
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, r]) => ({ rate, ...r }));
}
