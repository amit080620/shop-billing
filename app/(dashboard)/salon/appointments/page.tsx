import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AppointmentRow } from "./AppointmentRow";
import { Calendar } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const { date } = await searchParams;
  const selectedDate = date || todayIso();
  const admin = createSupabaseAdminClient();

  const { data: appointments } = await admin
    .from("appointments")
    .select("id, customer_name, customer_phone, service_name, stylist_name, appointment_time, status, notes")
    .eq("shop_id", session.shopId)
    .eq("appointment_date", selectedDate)
    .order("appointment_time", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Appointments"
        action={
          <Link href="/salon/appointments/new" className="btn-primary-sm">
            + Book
          </Link>
        }
        icon={<Calendar size={18} strokeWidth={1.8} />}
      />
      <Link href="/" className="text-sm text-muted">
        ← Home
      </Link>

      <form className="flex items-center gap-2" action="/salon/appointments">
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
        <Link href="/salon/appointments" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-brand">
          Today
        </Link>
      </form>

      {(!appointments || appointments.length === 0) ? (
        <EmptyState text="No appointments booked for this date." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {appointments.map((a) => (
            <AppointmentRow
              key={a.id}
              lang={lang}
              appointment={{
                id: a.id,
                customerName: a.customer_name,
                customerPhone: a.customer_phone,
                serviceName: a.service_name,
                stylistName: a.stylist_name,
                time: a.appointment_time,
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
