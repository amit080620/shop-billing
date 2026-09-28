import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { round2 } from "@/lib/gst";
import { buyerOf, buyerSchemaReady } from "@/lib/gstBuyer";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { getTranslator } from "@/lib/i18n/server";

/** The credit note handed to the customer (and kept for the auditor) when goods come back —
 * carries what Rule 53(1A) asks for: supplier and recipient details, its own serial number
 * and date, the invoice it reduces, the taxable value and the tax credited. */
export default async function PrintCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: ret }, { data: shop }, { data: invoiceSettings }] = await Promise.all([
    admin
      .from("returns")
      .select("return_number, created_at, reason, refund_method, total, cgst_amount, sgst_amount, igst_amount, bill_id, bills ( invoice_number, created_at, supply_type, customers ( name, phone, gstin, address, state ) )")
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("shops").select("address_line1, address_line2, city, state, pincode").eq("id", session.shopId).maybeSingle(),
    admin.from("invoice_settings").select("accent_color").eq("shop_id", session.shopId).maybeSingle(),
  ]);
  if (!ret) notFound();

  const { data: items } = await admin
    .from("return_items")
    .select("product_name, quantity, gst_percent, line_total, cgst_amount, sgst_amount, igst_amount, bill_items ( hsn_code )")
    .eq("return_id", id);

  type Customer = { name: string; phone: string | null; gstin: string | null; address: string | null; state: string | null };
  const bill = (Array.isArray(ret.bills) ? ret.bills[0] : ret.bills) as unknown as { invoice_number: string; created_at: string; supply_type: "intra" | "inter"; customers: Customer | Customer[] | null } | null;
  const billCustomer = bill ? (Array.isArray(bill.customers) ? bill.customers[0] : bill.customers) : null;
  // Issued to whoever the original invoice was made out to (frozen on that bill).
  const { data: buyerRow } = (await buyerSchemaReady(admin))
    ? await admin.from("bills").select("buyer_name, buyer_gstin, buyer_address, buyer_state, buyer_state_code").eq("id", ret.bill_id).maybeSingle()
    : { data: null };
  const party = buyerOf(buyerRow ?? {}, billCustomer ? { ...billCustomer, state_code: null } : null);
  const customer = party ? { name: party.name ?? "", phone: billCustomer?.phone ?? null, gstin: party.gstin, address: party.address, state: party.state } : null;
  const shopAddress = [shop?.address_line1, shop?.address_line2, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ");
  const accent = invoiceSettings?.accent_color ?? "#0f6b5c";
  const cgst = Number(ret.cgst_amount), sgst = Number(ret.sgst_amount), igst = Number(ret.igst_amount);
  const taxable = round2(Number(ret.total) - cgst - sgst - igst);
  const isInter = bill?.supply_type === "inter";

  const lines = (items ?? []).map((i) => {
    const tax = Number(i.cgst_amount) + Number(i.sgst_amount) + Number(i.igst_amount);
    const billItem = (Array.isArray(i.bill_items) ? i.bill_items[0] : i.bill_items) as { hsn_code: string | null } | null;
    return { name: i.product_name, hsn: billItem?.hsn_code ?? "—", qty: Number(i.quantity), rate: Number(i.gst_percent), taxable: round2(Number(i.line_total) - tax), amount: Number(i.line_total) };
  });

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/print/bill/${ret.bill_id}`} className="text-sm text-gray-500">
          ← {t("Original bill")}
        </Link>
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>

      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {shopAddress && <p className="text-xs text-gray-500">{shopAddress}</p>}
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight" style={{ color: accent }}>CREDIT NOTE</p>
          <p className="whitespace-nowrap text-xs text-gray-600">No. {ret.return_number}</p>
          <p className="text-xs text-gray-600">{formatDateTime(ret.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Issued to</p>
          <p className="font-medium text-gray-900">{customer?.name ?? "Walk-in customer"}</p>
          {customer?.address && <p className="text-xs text-gray-600">{customer.address}</p>}
          {customer?.phone && <p className="text-xs text-gray-600">{customer.phone}</p>}
          {customer?.gstin && <p className="text-xs text-gray-600">GSTIN: {customer.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Against invoice</p>
          <p className="font-medium text-gray-900">{bill?.invoice_number ?? "—"}</p>
          {bill && <p className="text-xs text-gray-600">{formatDateTime(bill.created_at)}</p>}
          <p className="text-xs text-gray-600">{isInter ? `Place of supply: ${customer?.state ?? "—"} (IGST)` : "Same state (CGST + SGST)"}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-[11px] text-gray-500">
            <th className="pb-1.5">Item returned</th>
            <th className="pb-1.5 pl-3">HSN</th>
            <th className="pb-1.5 pl-3 text-right">Qty</th>
            <th className="pb-1.5 pl-3 text-right">Taxable</th>
            <th className="pb-1.5 pl-3 text-right">GST</th>
            <th className="pb-1.5 pl-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-dashed border-gray-200">
              <td className="py-1.5 text-gray-900">{l.name}</td>
              <td className="py-1.5 pl-3 text-gray-600">{l.hsn}</td>
              <td className="py-1.5 pl-3 text-right text-gray-600">{l.qty}</td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right text-gray-600">{formatMoney(l.taxable)}</td>
              <td className="py-1.5 pl-3 text-right text-gray-600">{l.rate}%</td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right text-gray-900">{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="ml-auto mt-4 flex max-w-[260px] flex-col gap-1 text-sm">
        <Row label="Taxable value" value={formatMoney(taxable)} />
        {isInter ? (
          <Row label="IGST" value={formatMoney(igst)} />
        ) : (
          <>
            <Row label="CGST" value={formatMoney(cgst)} />
            <Row label="SGST" value={formatMoney(sgst)} />
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-gray-300 pt-1.5 font-semibold">
          <span>Total credited</span>
          <span>{formatMoney(Number(ret.total))}</span>
        </div>
        <p className="text-right text-xs text-gray-500">
          {ret.refund_method === "credit_adjustment" ? "Adjusted against the customer's balance" : `Refunded by ${ret.refund_method}`}
        </p>
      </div>

      {ret.reason && <p className="mt-4 text-xs text-gray-600">Reason: {ret.reason}</p>}

      <div className="mt-10 flex justify-end">
        <div className="w-56 border-t border-gray-400 pt-1 text-center text-xs text-gray-600">For {session.shopName} — Authorised signatory</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
