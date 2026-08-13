import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";

export default async function LabReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: order }, { data: invoiceSettings }] = await Promise.all([
    admin
      .from("lab_orders")
      .select("id, order_number, patient_name, patient_phone, patient_age, patient_gender, referring_doctor_name, status, created_at")
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("invoice_settings").select("accent_color, header_image_url, footer_image_url, footer_text").eq("shop_id", session.shopId).maybeSingle(),
  ]);
  if (!order) notFound();

  const { data: items } = await admin
    .from("lab_order_items")
    .select("test_name, reference_range, unit, result_value, result_flag")
    .eq("order_id", id)
    .order("test_name");

  const accentColor = invoiceSettings?.accent_color ?? "#0f6b5c";
  const allReported = (items ?? []).every((i) => i.result_value);

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      {invoiceSettings?.header_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- print page
        <img src={invoiceSettings.header_image_url} alt="" className="mb-2 max-h-20 w-full object-contain" />
      )}

      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: accentColor }}>
        <div>
          <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
          {session.shopGstin && <p className="text-xs text-gray-500">GSTIN: {session.shopGstin}</p>}
          <p className="text-xs text-gray-500">Laboratory Report</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-medium text-gray-900">#{order.order_number}</p>
          <p>{formatDateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <div>
          <p className="text-[10px] text-gray-500">Patient</p>
          <p className="font-medium text-gray-900">{order.patient_name}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Age / Gender</p>
          <p className="font-medium text-gray-900">
            {order.patient_age ?? "—"} / {order.patient_gender ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Phone</p>
          <p className="font-medium text-gray-900">{order.patient_phone}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Referring doctor</p>
          <p className="font-medium text-gray-900">{order.referring_doctor_name ? `Dr. ${order.referring_doctor_name}` : "Self"}</p>
        </div>
      </div>

      {!allReported && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠️ Some results are still pending — this is a partial/provisional report.
        </p>
      )}

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="border-b-2 text-left text-[11px] uppercase tracking-wide text-gray-500" style={{ borderColor: accentColor }}>
            <th className="pb-2">Test</th>
            <th className="pb-2 text-right">Result</th>
            <th className="pb-2 text-right">Reference range</th>
            <th className="pb-2 text-right">Unit</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item, i) => (
            <tr key={i} className="border-b border-dashed border-gray-200">
              <td className="py-2 text-gray-900">{item.test_name}</td>
              <td
                className={`py-2 text-right font-semibold ${
                  item.result_flag === "high" ? "text-red-600" : item.result_flag === "low" ? "text-blue-600" : "text-gray-900"
                }`}
              >
                {item.result_value ?? "Pending"}
                {item.result_flag === "high" && " ↑"}
                {item.result_flag === "low" && " ↓"}
              </td>
              <td className="py-2 text-right text-gray-600">{item.reference_range ?? "—"}</td>
              <td className="py-2 text-right text-gray-600">{item.unit ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-gray-500">
        ↑ / ↓ indicates the result falls outside the stated reference range only — a simple comparison, not a diagnosis. Please
        consult your doctor to interpret these results in the context of your health.
      </p>

      <div className="mt-12 grid grid-cols-2 gap-6 text-center text-xs">
        <div className="border-t border-gray-400 pt-1 text-gray-600">Lab Technician</div>
        <div className="border-t border-gray-400 pt-1 text-gray-600">Pathologist / Authorised signatory</div>
      </div>

      {invoiceSettings?.footer_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- print page
        <img src={invoiceSettings.footer_image_url} alt="" className="mt-6 max-h-16 w-full object-contain" />
      )}
      <p className="mt-4 text-center text-xs text-gray-500">{invoiceSettings?.footer_text || "Thank you for choosing us."}</p>

      <div className="no-print mt-6 flex justify-end">
        <PrintButton />
      </div>
    </div>
  );
}
