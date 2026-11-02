import Link from "@/lib/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { garmentSchemaReady } from "@/lib/garment/server";
import { movementGst } from "@/lib/garment/rules";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { getTranslator } from "@/lib/i18n/server";

/** The paper that travels with a godown transfer: a stock transfer note, printed as a delivery
 * challan (CGST Rule 55) — consigner and consignee places with their GSTINs, description, HSN,
 * quantity and value, the transporter, vehicle and e-way bill number. It is not a tax invoice. */
export default async function PrintTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (session.businessType !== "garment" || !(await garmentSchemaReady(admin))) notFound();
  const { data: tr } = await admin.from("stock_transfers").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!tr) notFound();
  const [{ data: items }, { data: gds }, { data: invoiceSettings }] = await Promise.all([
    admin.from("stock_transfer_items").select("product_id, product_name, quantity, dispatched, unit_value").eq("transfer_id", id).order("product_name"),
    admin.from("godowns").select("id, name, address, state, pin_code, gstin, phone").in("id", [tr.from_godown_id, tr.to_godown_id]),
    admin.from("invoice_settings").select("accent_color").eq("shop_id", session.shopId).maybeSingle(),
  ]);
  const productIds = (items ?? []).map((i) => i.product_id).filter((x): x is string => !!x);
  const { data: products } = productIds.length ? await admin.from("products").select("id, hsn_code, unit").in("id", productIds) : { data: [] };
  const prod = new Map((products ?? []).map((p) => [p.id, p]));
  const fromG = gds?.find((g) => g.id === tr.from_godown_id);
  const toG = gds?.find((g) => g.id === tr.to_godown_id);
  const accent = invoiceSettings?.accent_color ?? "#0f6b5c";
  const sent = !!tr.dispatched_at;
  const qtyOf = (i: { quantity: number; dispatched: number }) => (sent ? Number(i.dispatched) : Number(i.quantity));
  const total = (items ?? []).reduce((s, i) => s + qtyOf(i) * Number(i.unit_value), 0);
  const gst = movementGst({ fromGstin: tr.from_gstin, toGstin: tr.to_gstin, fromState: tr.from_state_code, toState: tr.to_state_code, value: Number(tr.consignment_value) });

  const place = (g: typeof fromG, gstin: string | null) => (
    <>
      <p className="font-medium text-gray-900">{g?.name ?? "—"}</p>
      {g?.address && <p className="text-xs text-gray-600">{[g.address, g.state, g.pin_code].filter(Boolean).join(", ")}</p>}
      {g?.phone && <p className="text-xs text-gray-600">{g.phone}</p>}
      <p className="text-xs text-gray-600">GSTIN: {gstin || session.shopGstin || "—"}</p>
    </>
  );

  return (
    <div className="relative mx-auto max-w-3xl bg-white p-8 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/garment/transfers/${tr.id}`} className="text-sm text-gray-500">
          ← {t("Transfer")}
        </Link>
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>

      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight" style={{ color: accent }}>
            {gst.internal ? "STOCK TRANSFER NOTE" : "DELIVERY CHALLAN"}
          </p>
          <p className="text-[11px] text-gray-500">{gst.internal ? "Delivery challan — movement between own places, not a supply" : "Delivery challan (Rule 55) — not a tax invoice"}</p>
          <p className="whitespace-nowrap text-xs text-gray-600">No. {tr.challan_ref || tr.number}</p>
          <p className="text-xs text-gray-600">{tr.dispatched_at ? formatDateTime(tr.dispatched_at) : tr.transfer_date}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">From (consigner)</p>
          {place(fromG, tr.from_gstin)}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">To (consignee)</p>
          {place(toG, tr.to_gstin)}
        </div>
      </div>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-1.5">#</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5">HSN</th>
            <th className="py-1.5 text-right">Qty</th>
            <th className="py-1.5 text-right">Rate</th>
            <th className="py-1.5 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((i, n) => {
            const p = i.product_id ? prod.get(i.product_id) : undefined;
            return (
              <tr key={n} className="border-b border-gray-100">
                <td className="py-1.5 text-gray-500">{n + 1}</td>
                <td className="py-1.5 text-gray-900">{i.product_name}</td>
                <td className="py-1.5 text-gray-600">{p?.hsn_code ?? "—"}</td>
                <td className="py-1.5 text-right">
                  {qtyOf(i)} {p?.unit ?? ""}
                </td>
                <td className="py-1.5 text-right">{formatMoney(Number(i.unit_value))}</td>
                <td className="py-1.5 text-right">{formatMoney(Math.round(qtyOf(i) * Number(i.unit_value) * 100) / 100)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ml-auto mt-2 flex max-w-[260px] justify-between border-t border-gray-300 pt-1.5 text-sm font-semibold">
        <span>Value of goods</span>
        <span>{formatMoney(Math.round(total * 100) / 100)}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-700">
        <p>Reason: {tr.movement_reason || "Stock transfer"}</p>
        <p>Transfer no.: {tr.number}</p>
        <p>Transporter: {tr.transporter || "—"}</p>
        <p>Vehicle: {tr.vehicle_number || "—"}</p>
        <p>E-way bill: {tr.eway_bill_no || (gst.ewayLikely ? "required — not recorded" : "—")}</p>
        {tr.remarks && <p>Remarks: {tr.remarks}</p>}
      </div>

      <div className="mt-12 flex justify-between gap-6 text-xs text-gray-600">
        <div className="w-48 border-t border-gray-400 pt-1 text-center">Received by (name, sign, date)</div>
        <div className="w-56 border-t border-gray-400 pt-1 text-center">For {session.shopName} — Authorised signatory</div>
      </div>
    </div>
  );
}
