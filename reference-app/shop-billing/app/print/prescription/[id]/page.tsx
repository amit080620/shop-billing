import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { GenerateBillButton } from "./GenerateBillButton";

export default async function PrintPrescriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: prescription }, { data: settings }, { data: shop }, { data: invoiceSettings }] = await Promise.all([
    admin
      .from("prescriptions")
      .select(
        "id, prescription_number, patient_name, patient_age, patient_gender, patient_phone, doctor_name, custom_sections, follow_up_date, vitals, dental_chart, bill_id, created_at, customers ( name, phone, address )",
      )
      .eq("id", id)
      .eq("shop_id", session.shopId)
      .single(),
    admin.from("prescription_settings").select("header_text, footer_text, show_shop_logo, header_image_url, footer_image_url").eq("shop_id", session.shopId).maybeSingle(),
    admin.from("shops").select("name, logo_url").eq("id", session.shopId).single(),
    admin.from("invoice_settings").select("accent_color").eq("shop_id", session.shopId).maybeSingle(),
  ]);

  if (!prescription) notFound();

  const { data: items } = await admin
    .from("prescription_items")
    .select("medicine_name, dosage, frequency, duration, instructions, quantity")
    .eq("prescription_id", id)
    .order("sort_order", { ascending: true });

  const customer = Array.isArray(prescription.customers)
    ? prescription.customers[0]
    : (prescription.customers as { name: string; phone: string; address: string | null } | null);

  const customSections = (prescription.custom_sections as { label: string; value: string }[]) ?? [];
  const dateFormatted = new Date(prescription.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const followUpFormatted = prescription.follow_up_date
    ? new Date(prescription.follow_up_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      {/* Letterhead */}
      {settings?.header_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- print page
        <img src={settings.header_image_url} alt="" className="mb-2 max-h-20 w-full object-contain" />
      )}
      <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: invoiceSettings?.accent_color ?? "#1f2937" }}>
        <div className="flex items-center gap-3">
          {settings?.show_shop_logo !== false && shop?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- print page, static shop-uploaded logo
            <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
          )}
          <div>
            {settings?.header_text ? (
              settings.header_text.split("\n").map((line, i) => (
                <p key={i} className={i === 0 ? "text-lg font-bold text-gray-900" : "text-xs text-gray-600"}>
                  {line}
                </p>
              ))
            ) : (
              <p className="text-lg font-bold text-gray-900">{shop?.name ?? "Clinic"}</p>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-medium text-gray-900">#{prescription.prescription_number}</p>
          <p>{dateFormatted}</p>
        </div>
      </div>

      {/* Patient bar */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
        <span><strong className="text-gray-900">{prescription.patient_name}</strong></span>
        {prescription.patient_age && <span className="text-gray-600">{prescription.patient_age} yrs</span>}
        {prescription.patient_gender && <span className="capitalize text-gray-600">{prescription.patient_gender}</span>}
        {(prescription.patient_phone || customer?.phone) && <span className="text-gray-600">{prescription.patient_phone || customer?.phone}</span>}
      </div>

      {/* Vitals */}
      {prescription.vitals && Object.keys(prescription.vitals as Record<string, string>).length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Vitals</p>
          <p className="text-xs text-gray-700">
            {Object.entries(prescription.vitals as Record<string, string>)
              .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim()}: ${v}`)
              .join(" · ")}
          </p>
        </div>
      )}

      {/* Dental chart */}
      {prescription.dental_chart && Object.keys(prescription.dental_chart as Record<string, string>).length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tooth chart</p>
          <p className="text-xs text-gray-700">
            {Object.entries(prescription.dental_chart as Record<string, string>)
              .map(([tooth, condition]) => `#${tooth}: ${condition.replace("_", " ")}`)
              .join(" · ")}
          </p>
        </div>
      )}

      {/* Custom sections */}
      {customSections.filter((s) => s.value.trim()).length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {customSections
            .filter((s) => s.value.trim())
            .map((s, i) => (
              <div key={i}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</p>
                <p className="text-sm text-gray-900">{s.value}</p>
              </div>
            ))}
        </div>
      )}

      {/* Rx */}
      {items && items.length > 0 && (
        <div className="mt-5">
          <p className="text-2xl font-serif italic" style={{ color: invoiceSettings?.accent_color ?? "#1f2937" }}>℞</p>
          <ul className="mt-1 flex flex-col gap-3">
            {items.map((item, i) => (
              <li key={i} className="border-b border-dashed border-gray-200 pb-2 text-sm">
                <p className="font-medium text-gray-900">
                  {i + 1}. {item.medicine_name} {item.dosage ? `— ${item.dosage}` : ""}
                </p>
                <p className="pl-4 text-xs text-gray-600">
                  {[item.frequency, item.duration, item.instructions].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {followUpFormatted && (
        <p className="mt-4 text-sm text-gray-700">
          <strong>Follow-up:</strong> {followUpFormatted}
        </p>
      )}

      {prescription.doctor_name && (
        <div className="mt-10 text-right">
          <p className="text-sm font-semibold text-gray-900">{prescription.doctor_name}</p>
          <p className="text-xs text-gray-500">Signature</p>
        </div>
      )}

      {settings?.footer_image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- print page
        <img src={settings.footer_image_url} alt="" className="mt-6 max-h-16 w-full object-contain" />
      )}

      {settings?.footer_text && (
        <div className="mt-8 border-t border-gray-200 pt-3 text-center text-[11px] text-gray-500">
          {settings.footer_text.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      <div className="no-print mt-6 flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <PrintButton />
        </div>
        {items && items.length > 0 && (
          <GenerateBillButton prescriptionId={prescription.id} alreadyBilled={!!prescription.bill_id} existingBillId={prescription.bill_id} />
        )}
        <Link href="/clinic" className="text-center text-sm text-muted">
          ← Back to Clinic
        </Link>
      </div>
    </div>
  );
}
