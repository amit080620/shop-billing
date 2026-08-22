import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { ToothChartStatic } from "@/app/components/ToothChart";

export default async function PrintTreatmentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: plan }, { data: shop }] = await Promise.all([
    admin
      .from("treatment_plans")
      .select("id, patient_name, patient_phone, doctor_name, notes, dental_chart, created_at")
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("shops").select("name, logo_url").eq("id", session.shopId).single(),
  ]);

  if (!plan) notFound();

  const { data: items } = await admin
    .from("treatment_plan_items")
    .select("tooth_number, procedure_name, description, estimated_cost")
    .eq("treatment_plan_id", id)
    .order("sort_order", { ascending: true });

  const total = (items ?? []).reduce((s, it) => s + Number(it.estimated_cost), 0);

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-[#1a1a1a]" style={{ fontFamily: "-apple-system, system-ui, sans-serif" }}>
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <p className="text-lg font-bold">{shop?.name ?? "Clinic"}</p>
          <p className="text-xs text-gray-500">Treatment Plan & Quotation</p>
        </div>
        {shop?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- print page, small logo
          <img src={shop.logo_url} alt="" className="h-12 w-12 object-contain" />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-gray-500">Patient</p>
          <p className="font-medium">{plan.patient_name}</p>
        </div>
        {plan.patient_phone && (
          <div>
            <p className="text-gray-500">Phone</p>
            <p className="font-medium">{plan.patient_phone}</p>
          </div>
        )}
        {plan.doctor_name && (
          <div>
            <p className="text-gray-500">Doctor</p>
            <p className="font-medium">Dr. {plan.doctor_name}</p>
          </div>
        )}
        <div>
          <p className="text-gray-500">Date</p>
          <p className="font-medium">{new Date(plan.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
      </div>

      {(() => {
        const chart = plan.dental_chart as Record<string, string[]> | null;
        return (
          chart &&
          Object.keys(chart).length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2 rounded border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase text-gray-500">Tooth chart</p>
              <ToothChartStatic chart={chart} />
            </div>
          )
        );
      })()}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-800 text-left text-xs uppercase text-gray-500">
            <th className="py-2">Tooth</th>
            <th className="py-2">Procedure</th>
            <th className="py-2 text-right">Estimated cost</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((it, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 align-top text-gray-600">{it.tooth_number ?? "—"}</td>
              <td className="py-2 align-top">
                <p className="font-medium">{it.procedure_name}</p>
                {it.description && <p className="text-xs text-gray-500">{it.description}</p>}
              </td>
              <td className="py-2 text-right align-top font-medium">₹{Number(it.estimated_cost).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <div className="flex w-48 justify-between border-t-2 border-gray-800 pt-2 text-sm font-bold">
          <span>Total estimate</span>
          <span>₹{total.toLocaleString("en-IN")}</span>
        </div>
      </div>

      {plan.notes && (
        <div className="mt-6 rounded border border-gray-200 p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">Notes</p>
          <p className="mt-1 text-gray-700">{plan.notes}</p>
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        This is genuinely an estimate for planning purposes — the final bill may vary based on treatment actually
        performed.
      </p>
    </div>
  );
}
