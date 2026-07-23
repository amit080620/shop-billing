import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import { WhatsAppSendButton } from "./WhatsAppSendButton";

export default async function PrintBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const { id } = await params;
  const { format } = await searchParams;
  const isThermal = format === "thermal";

  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: bill } = await admin
    .from("bills")
    .select(
      "id, invoice_number, subtotal, discount_type, discount_value, discount_amount, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, gst_amount, payment_method, total, paid_amount, credit_amount, created_at, customers ( name, phone, gstin, address )",
    )
    .eq("id", id)
    .eq("shop_id", session.shopId) // ownership check
    .single();

  if (!bill) notFound();

  const { data: items } = await admin
    .from("bill_items")
    .select("product_name, hsn_code, quantity, unit_price, gst_percent, cgst_amount, sgst_amount, igst_amount, line_total")
    .eq("bill_id", id)
    .order("product_name");

  const customer = Array.isArray(bill.customers)
    ? bill.customers[0]
    : (bill.customers as { name: string; phone: string; gstin: string | null; address: string | null } | null);

  const isIntra = bill.supply_type === "intra";
  const paymentLabel = paymentMethodLabel(bill.payment_method);

  return (
    <div
      className={`mx-auto bg-white text-black ${
        isThermal ? "w-[72mm] p-2 font-mono text-xs" : "max-w-2xl p-8"
      }`}
    >
      <div className="no-print mb-4 flex flex-col gap-2">
        <WhatsAppSendButton
          customerName={customer?.name ?? null}
          customerPhone={customer?.phone ?? null}
          shopName={session.shopName}
          invoiceNumber={bill.invoice_number}
          total={Number(bill.total)}
          paidAmount={Number(bill.paid_amount)}
          creditAmount={Number(bill.credit_amount)}
        />
        <div className="flex justify-end gap-2">
          <a
            href={`/print/bill/${id}?format=full`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            Full page
          </a>
          <a
            href={`/print/bill/${id}?format=thermal`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            Thermal (72mm)
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="mb-1 flex items-center gap-3">
        {session.shopLogoUrl && (
          // Plain <img>, not next/image — this render also feeds the browser
          // print dialog, where next/image's lazy-loading can leave it blank.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.shopLogoUrl}
            alt=""
            className={isThermal ? "h-8 w-8 object-contain" : "h-12 w-12 object-contain"}
          />
        )}
        <div className="flex flex-1 items-center justify-between">
          <h1 className={isThermal ? "text-sm font-bold" : "text-xl font-bold"}>
            {session.shopName}
          </h1>
          <p className={isThermal ? "text-[9px] font-semibold" : "text-sm font-semibold text-gray-700"}>
            Tax Invoice
          </p>
        </div>
      </div>
      {session.shopGstin && (
        <p className={isThermal ? "text-[9px] text-gray-600" : "text-xs text-gray-500"}>
          GSTIN: {session.shopGstin}
        </p>
      )}

      <div className={`mt-2 flex justify-between ${isThermal ? "text-[10px]" : "text-sm"}`}>
        <span>Invoice #{bill.invoice_number}</span>
        <span>{formatDateTime(bill.created_at)}</span>
      </div>

      <div className={`mt-2 border-t border-dashed border-gray-400 pt-2 ${isThermal ? "" : "text-sm text-gray-700"}`}>
        <p>Bill to: {customer?.name ?? "Walk-in customer"}</p>
        {customer?.phone && <p className={isThermal ? "text-[9px]" : "text-xs text-gray-500"}>{customer.phone}</p>}
        {customer?.gstin && <p className={isThermal ? "text-[9px]" : "text-xs text-gray-500"}>GSTIN: {customer.gstin}</p>}
        <p className={isThermal ? "text-[9px] text-gray-600" : "text-xs text-gray-500"}>
          Place of supply: {isIntra ? "Same state (CGST + SGST)" : "Different state (IGST)"}
        </p>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className={isThermal ? "border-b border-black" : "border-b border-gray-300 text-sm"}>
            <th className="py-1 text-left">Item</th>
            {!isThermal && <th className="py-1 text-left">HSN</th>}
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item, i) => (
            <tr key={i} className={isThermal ? "" : "text-sm"}>
              <td className="py-1">{item.product_name}</td>
              {!isThermal && <td className="py-1 text-gray-500">{item.hsn_code ?? "—"}</td>}
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">{formatMoney(item.unit_price)}</td>
              <td className="py-1 text-right">{formatMoney(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={`mt-3 flex flex-col gap-1 border-t border-dashed border-gray-400 pt-2 ${isThermal ? "" : "text-sm"}`}>
        <SummaryRow label="Subtotal" value={formatMoney(bill.subtotal)} />
        {bill.discount_amount > 0 && (
          <SummaryRow
            label={`Discount (${
              bill.discount_type === "percent" ? `${bill.discount_value}%` : "flat"
            })`}
            value={`− ${formatMoney(bill.discount_amount)}`}
          />
        )}
        <SummaryRow label="Taxable value" value={formatMoney(bill.taxable_amount)} />
        {isIntra ? (
          <>
            <SummaryRow label="CGST" value={`+ ${formatMoney(bill.cgst_amount)}`} />
            <SummaryRow label="SGST" value={`+ ${formatMoney(bill.sgst_amount)}`} />
          </>
        ) : (
          <SummaryRow label="IGST" value={`+ ${formatMoney(bill.igst_amount)}`} />
        )}
        <SummaryRow label="Total" value={formatMoney(bill.total)} bold />
        <SummaryRow label={`Paid (${paymentLabel})`} value={formatMoney(bill.paid_amount)} />
        {bill.credit_amount > 0 && (
          <SummaryRow label="Credit (udhaar)" value={formatMoney(bill.credit_amount)} bold />
        )}
      </div>

      <p className={`mt-6 text-center ${isThermal ? "text-[10px]" : "text-xs text-gray-500"}`}>
        Thank you for your business!
      </p>
    </div>
  );
}

function paymentMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "upi":
      return "UPI";
    case "online":
      return "Online";
    default:
      return "Other";
  }
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
