import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { formatStayDateLong } from "@/lib/hotel/dates";
import { hotelOpsReady, loose } from "@/lib/hotel/ops";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";

const date = (d: string | null) => (d ? formatStayDateLong(d) : "");

/** A foreign guest's details laid out as Form C asks for them, to keep and to copy onto the FRRO portal. */
export default async function PrintFormCPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelOpsReady(admin))) notFound();
  const { data: b } = await loose(admin).from("hotel_bookings").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!b) notFound();

  const rows: [string, string | null | number][] = [
    ["Name", b.guest_name],
    ["Nationality", b.nationality],
    ["Gender", b.gender],
    ["Date of birth", date(b.date_of_birth)],
    ["Home address", b.guest_address],
    ["Mobile number", b.guest_phone],
    ["Passport number", b.passport_number],
    ["Passport: place of issue", b.passport_issued_at],
    ["Passport: date of issue", date(b.passport_issue_date)],
    ["Passport: valid till", date(b.passport_expiry)],
    ["Visa number", b.visa_number],
    ["Visa type", b.visa_type],
    ["Visa: place of issue", b.visa_issued_at],
    ["Visa: date of issue", date(b.visa_issue_date)],
    ["Visa: valid till", date(b.visa_expiry)],
    ["Arrived in India on", date(b.arrival_in_india)],
    ["Arrived at the hotel on", date(b.check_in_date)],
    ["Expected to leave on", date(b.check_out_date)],
    ["Coming from", b.arrived_from],
    ["Going to next", b.going_to],
    ["Purpose of visit", b.visit_purpose],
    ["Booking", b.booking_number],
    ["Reference from the portal", b.form_c_reference],
  ];

  return (
    <div className="relative mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="no-print mb-4">
        <Link href={`/hotel/form-c/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ChevronLeft size={16} /> {t("common.back")}
        </Link>
      </div>
      <div className="border-b-2 border-gray-800 pb-3">
        <p className="text-lg font-bold text-gray-900">{session.shopName}</p>
        <p className="text-sm text-gray-600">Form C: details of foreign guest</p>
      </div>
      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-gray-200">
              <th scope="row" className="w-1/2 py-1.5 pr-3 text-left font-medium text-gray-600">{label}</th>
              <td className="py-1.5 text-gray-900">{value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-xs text-gray-500">For the hotel&apos;s records. File on the FRRO portal within 24 hours of the guest&apos;s arrival.</p>
      <div className="no-print mt-6">
        <PrintButton labels={{ print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") }} />
      </div>
    </div>
  );
}
