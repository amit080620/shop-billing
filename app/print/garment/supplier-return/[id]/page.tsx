import Link from "@/lib/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { garmentSchemaReady } from "@/lib/garment/server";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { getTranslator } from "@/lib/i18n/server";

/** The debit note sent with goods returned to a supplier: the purchase it goes against, each line
 * at a rate no higher than bought, GST at the purchase line's rate, and the vehicle and LR number.
 * The supplier issues the GST credit note against it. */
export default async function PrintSupplierReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await garmentSchemaReady(admin))) notFound();
  const { data: r } = await admin.from("purchase_returns").select("*").eq("id", id).eq("shop_id", session.shopId).eq("status", "posted").maybeSingle();
  if (!r) notFound();
  const [{ data: items }, { data: vendor }, { data: purchase }, { data: shop }, { data: invoiceSettings }] = await Promise.all([
    admin.from("purchase_return_items").select("product_name, quantity, rate, gst_percent, taxable_value, gst_amount, total, purchase_item_id").eq("return_id", id).order("product_name"),
    admin.from("vendors").select("name, gstin, address, state, state_code, phone").eq("id", r.vendor_id).maybeSingle(),
    admin.from("purchases").select("vendor_invoice_number, purchase_date, supply_type").eq("id", r.purchase_id).maybeSingle(),
    admin.from("shops").select("address_line1, address_line2, city, state, pincode").eq("id", session.shopId).maybeSingle(),
    admin.from("invoice_settings").select("accent_color").eq("shop_id", session.shopId).maybeSingle(),
  ]);
  const piIds = (items ?? []).map((i) => i.purchase_item_id);
  const { data: pis } = piIds.length ? await admin.from("purchase_items").select("id, hsn_code").in("id", piIds) : { data: [] };
  const hsn = new Map((pis ?? []).map((p) => [p.id, p.hsn_code]));
  const accent = invoiceSettings?.accent_color ?? "#0f6b5c";
  const inter = purchase?.supply_type === "inter";
  const shopAddress = [shop?.address_line1, shop?.address_line2, shop?.city, shop?.state, shop?.pincode].filter(Boolean).join(", ");
  const gst = Number(r.gst_amount);

  return (
    <div className="relative mx-auto max-w-3xl bg-white p-8 text-black">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/garment/supplier-returns/${r.id}`} className="text-sm text-gray-500">
          ← {t("Supplier return")}
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
          <p className="text-lg font-semibold tracking-tight" style={{ color: accent }}>DEBIT NOTE</p>
          <p className="text-[11px] text-gray-500">Goods returned to supplier</p>
          <p className="whitespace-nowrap text-xs text-gray-600">No. {r.number}</p>
          <p className="text-xs text-gray-600">{r.posted_at ? formatDateTime(r.posted_at) : r.return_date}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Supplier</p>
          <p className="font-medium text-gray-900">{vendor?.name ?? "—"}</p>
          {vendor?.address && <p className="text-xs text-gray-600">{vendor.address}</p>}
          {vendor?.phone && <p className="text-xs text-gray-600">{vendor.phone}</p>}
          {vendor?.gstin && <p className="text-xs text-gray-600">GSTIN: {vendor.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Against purchase invoice</p>
          <p className="font-medium text-gray-900">{purchase?.vendor_invoice_number ?? "—"}</p>
          <p className="text-xs text-gray-600">{purchase?.purchase_date ?? ""}</p>
          <p className="text-xs text-gray-600">{inter ? "Inter-state (IGST)" : "Same state (CGST + SGST)"}</p>
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
            <th className="py-1.5 text-right">Taxable</th>
            <th className="py-1.5 text-right">GST</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((i, n) => (
            <tr key={n} className="border-b border-gray-100">
              <td className="py-1.5 text-gray-500">{n + 1}</td>
              <td className="py-1.5 text-gray-900">{i.product_name}</td>
              <td className="py-1.5 text-gray-600">{hsn.get(i.purchase_item_id) ?? "—"}</td>
              <td className="py-1.5 text-right">{Number(i.quantity)}</td>
              <td className="py-1.5 text-right">{formatMoney(Number(i.rate))}</td>
              <td className="py-1.5 text-right">{formatMoney(Number(i.taxable_value))}</td>
              <td className="py-1.5 text-right">
                {formatMoney(Number(i.gst_amount))} <span className="text-[10px] text-gray-500">({Number(i.gst_percent)}%)</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-3 flex max-w-[280px] flex-col gap-1 text-sm">
        <Row label="Taxable value" value={formatMoney(Number(r.taxable_value))} />
        {inter ? (
          <Row label="IGST" value={formatMoney(gst)} />
        ) : (
          <>
            <Row label="CGST" value={formatMoney(Math.round((gst / 2) * 100) / 100)} />
            <Row label="SGST" value={formatMoney(Math.round((gst - Math.round((gst / 2) * 100) / 100) * 100) / 100)} />
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-gray-300 pt-1.5 font-semibold">
          <span>Total</span>
          <span>{formatMoney(Number(r.total))}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-700">
        {r.reason && <p>Reason: {r.reason}</p>}
        <p>Transporter: {r.transporter || "—"}</p>
        <p>Vehicle: {r.vehicle_number || "—"}</p>
        <p>LR / docket: {r.lr_number || "—"}</p>
        {r.debit_note_ref && <p>Supplier&apos;s ref.: {r.debit_note_ref}</p>}
      </div>

      <div className="mt-12 flex justify-between gap-6 text-xs text-gray-600">
        <div className="w-48 border-t border-gray-400 pt-1 text-center">Received by the supplier</div>
        <div className="w-56 border-t border-gray-400 pt-1 text-center">For {session.shopName} — Authorised signatory</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="whitespace-nowrap text-gray-900">{value}</span>
    </div>
  );
}
