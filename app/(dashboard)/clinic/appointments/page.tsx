import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ClinicAppointmentRow } from "./ClinicAppointmentRow";
import { Calendar } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

export default async function ClinicAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;
  const selectedDate = date || todayIso();
  const admin = createSupabaseAdminClient();

  const { data: appointments } = await admin
    .from("clinic_appointments")
    .select("id, patient_name, patient_phone, reason_for_visit, appointment_time, doctor_name, status, notes")
    .eq("shop_id", session.shopId)
    .eq("appointment_date", selectedDate)
    .order("appointment_time", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Appointments"
        action={
          <Link href="/clinic/appointments/new" className="btn-primary-sm">
            + Book
          </Link>
        }
        icon={<Calendar size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      <Link
        href="/clinic/settings/booking"
        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground"
        style={{ boxShadow: "-3px -3px 8px var(--neu-light), 3px 3px 8px var(--neu-dark)" }}
      >
        <span className="flex items-center gap-2">
          <Calendar size={15} className="text-brand-text" /> Calendar management — working hours & slot gap
        </span>
        <span className="text-muted">→</span>
      </Link>

      <form className="flex items-center gap-2" action="/clinic/appointments">
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
        <Link href="/clinic/appointments" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-brand">
          Today
        </Link>
      </form>

      {(!appointments || appointments.length === 0) ? (
        <EmptyState text="No appointments booked for this date." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {appointments.map((a) => (
            <ClinicAppointmentRow
              key={a.id}
              appointment={{
                id: a.id,
                patientName: a.patient_name,
                patientPhone: a.patient_phone,
                reasonForVisit: a.reason_for_visit,
                time: a.appointment_time,
                doctorName: a.doctor_name,
                status: a.status,
                notes: a.notes,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
