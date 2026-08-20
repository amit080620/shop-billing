export type A4InvoiceItem = {
  name: string;
  hsnCode: string | null;
  qty: number;
  rate: number;
  mrp?: number | null;
  taxPercent: number;
  amount: number;
  warrantyText?: string | null;
};

export type A4InvoiceData = {
  shopName: string;
  shopLogoUrl?: string | null;
  shopAddress?: string | null;
  shopPhone?: string | null;
  gstin?: string | null;
  tagline?: string | null;
  accentColor?: string | null;

  invoiceNumber: string;
  dateText: string;

  customerName?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  serviceProviderName?: string | null;
  placeOfSupplyText: string;

  items: A4InvoiceItem[];
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

  bankDetails?: string | null;
  termsAndConditions?: string | null;
  footerText?: string | null;
  voidedReason?: string | null;
  editedNote?: string | null;
  upiQrDataUrl?: string | null;
  upiId?: string | null;
};

function money(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The Apple-system font stack — genuinely resolves to SF Pro on
 * macOS/iOS (where it's actually installed), and falls back to a
 * clean, modern system sans on Windows/Android/Linux rather than
 * depending on SF Pro being present everywhere. This is deliberately
 * NOT the app's own "Plus Jakarta Sans" UI font — the invoice is a
 * printed business document, not app chrome, and should carry its own
 * typographic identity. */
const A4_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif';

export function A4Renderer({ data }: { data: A4InvoiceData }) {
  const accent = data.accentColor || "#1a1a1a";

  return (
    <div
      className="bg-white text-[#1a1a1a]"
      style={{ fontFamily: A4_FONT_STACK, fontSize: "13px", lineHeight: 1.55 }}
    >
      {data.voidedReason && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This invoice has been voided — {data.voidedReason}
        </div>
      )}
      {data.editedNote && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {data.editedNote}
        </div>
      )}

      {/* Header — business identity left, INVOICE title + metadata right,
          balanced with whitespace rather than boxes or borders. */}
      <div className="flex items-start justify-between gap-8">
        <div className="flex items-start gap-4">
          {data.shopLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- print page
            <img src={data.shopLogoUrl} alt="" className="h-14 w-14 object-contain" />
          )}
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">{data.shopName}</h1>
            {data.tagline && <p className="mt-0.5 text-[13px] text-neutral-500">{data.tagline}</p>}
            {data.shopAddress && <p className="mt-2 text-[12px] text-neutral-500">{data.shopAddress}</p>}
            <p className="text-[12px] text-neutral-500">
              {[data.shopPhone, data.gstin ? `GSTIN ${data.gstin}` : null].filter(Boolean).join("  ·  ")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-semibold tracking-tight" style={{ color: accent }}>
            INVOICE
          </p>
          <p className="mt-1 text-[12px] text-neutral-500">Invoice No. {data.invoiceNumber}</p>
          <p className="text-[12px] text-neutral-500">{data.dateText}</p>
        </div>
      </div>

      <div className="mt-10 h-px bg-neutral-200" />

      {/* Bill-to / metadata — two clean columns, no borders. */}
      <div className="mt-8 flex justify-between gap-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Bill To</p>
          <p className="mt-1.5 text-[14px] font-medium">
            {data.customerName || "Walk-in customer"}
          </p>
          {data.serviceProviderName && <p className="text-[12px] text-neutral-500">Stylist: {data.serviceProviderName}</p>}
          {data.customerAddress && <p className="text-[12px] text-neutral-500">{data.customerAddress}</p>}
          {data.customerPhone && <p className="text-[12px] text-neutral-500">{data.customerPhone}</p>}
          {data.customerGstin && <p className="text-[12px] text-neutral-500">GSTIN {data.customerGstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Place of Supply</p>
          <p className="mt-1.5 text-[13px] text-neutral-600">{data.placeOfSupplyText}</p>
        </div>
      </div>

      {/* Item table — subtle separators, not heavy grid borders. */}
      <table className="mt-10 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <th className="pb-2.5 text-left font-semibold">Description</th>
            <th className="pb-2.5 text-left font-semibold">HSN</th>
            <th className="pb-2.5 text-right font-semibold">Qty</th>
            <th className="pb-2.5 text-right font-semibold">Rate</th>
            <th className="pb-2.5 text-right font-semibold">Tax</th>
            <th className="pb-2.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-3 pr-3 text-[13px]">
                {item.name}
                {item.warrantyText && <div className="mt-0.5 text-[11px] text-neutral-400">{item.warrantyText}</div>}
                {item.mrp != null && item.mrp > item.rate && (
                  <div className="mt-0.5 text-[11px] text-neutral-400 line-through">MRP {money(item.mrp)}</div>
                )}
              </td>
              <td className="py-3 pr-3 text-[12px] text-neutral-500">{item.hsnCode ?? "—"}</td>
              <td className="py-3 pr-3 text-right text-[13px] tabular-nums">{item.qty}</td>
              <td className="py-3 pr-3 text-right text-[13px] tabular-nums">{money(item.rate)}</td>
              <td className="py-3 pr-3 text-right text-[12px] text-neutral-500 tabular-nums">{item.taxPercent}%</td>
              <td className="py-3 text-right text-[13px] font-medium tabular-nums">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tax summary + Grand Total — right-aligned, restrained,
          typography-driven hierarchy rather than a colored box. */}
      <div className="mt-8 flex justify-end">
        <div className="w-full max-w-[280px]">
          {data.savingsOffMrp != null && data.savingsOffMrp > 0 && (
            <SummaryLine label="You saved (off MRP)" value={money(data.savingsOffMrp)} />
          )}
          <SummaryLine label="Subtotal" value={money(data.subtotal)} />
          {data.discountAmount != null && data.discountAmount > 0 && (
            <SummaryLine label={data.discountLabel ?? "Discount"} value={`− ${money(data.discountAmount)}`} />
          )}
          <SummaryLine label="Taxable Value" value={money(data.taxableAmount)} />
          {data.isIntraState ? (
            <>
              {data.cgstAmount != null && <SummaryLine label="CGST" value={money(data.cgstAmount)} />}
              {data.sgstAmount != null && <SummaryLine label="SGST" value={money(data.sgstAmount)} />}
            </>
          ) : (
            data.igstAmount != null && <SummaryLine label="IGST" value={money(data.igstAmount)} />
          )}
          {data.roundOffAmount != null && Math.abs(data.roundOffAmount) > 0.001 && (
            <SummaryLine
              label="Round off"
              value={`${data.roundOffAmount > 0 ? "+" : "−"} ${money(Math.abs(data.roundOffAmount))}`}
            />
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-neutral-300 pt-3">
            <p className="text-[13px] font-semibold">Grand Total</p>
            <p className="text-[20px] font-semibold tabular-nums" style={{ color: accent }}>
              {money(data.total)}
            </p>
          </div>

          <div className="mt-3 text-[12px] text-neutral-500">
            <SummaryLine label={`Paid (${data.paymentLabel})`} value={money(data.paidAmount)} />
            {data.creditAmount != null && data.creditAmount > 0 && (
              <div className="mt-1 flex items-baseline justify-between font-medium text-amber-700">
                <p>Balance Due</p>
                <p className="tabular-nums">{money(data.creditAmount)}</p>
              </div>
            )}
          </div>

          {data.upiQrDataUrl && data.creditAmount != null && data.creditAmount > 0 && (
            <div className="mt-4 flex flex-col items-end gap-1.5">
              <p className="text-[11px] text-neutral-400">Scan to pay</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- static data URL, print page */}
              <img src={data.upiQrDataUrl} alt="UPI payment QR code" className="h-24 w-24" />
              {data.upiId && <p className="text-[10px] text-neutral-400">{data.upiId}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Footer — small but readable, restrained. */}
      {(data.bankDetails || data.termsAndConditions || data.footerText) && (
        <div className="mt-16 border-t border-neutral-200 pt-6">
          <div className="flex justify-between gap-10">
            {data.bankDetails && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Bank Details</p>
                {data.bankDetails.split("\n").map((line, i) => (
                  <p key={i} className="mt-1 text-[11px] text-neutral-500">
                    {line}
                  </p>
                ))}
              </div>
            )}
            {data.termsAndConditions && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Terms &amp; Conditions</p>
                {data.termsAndConditions.split("\n").map((line, i) => (
                  <p key={i} className="mt-1 text-[11px] text-neutral-500">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
          <p className="mt-8 text-center text-[12px] text-neutral-400">
            {data.footerText || "Thank you for your business."}
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <p className="text-[12.5px] text-neutral-500">{label}</p>
      <p className="text-[13px] tabular-nums">{value}</p>
    </div>
  );
}
