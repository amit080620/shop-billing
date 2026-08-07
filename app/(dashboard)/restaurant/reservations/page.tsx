import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ReservationRow } from "./ReservationRow";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date } = await searchParams;
  const selectedDate = date || todayIso();
  const admin = createSupabaseAdminClient();

  const { data: reservations } = await admin
    .from("restaurant_reservations")
    .select("id, customer_name, customer_phone, party_size, reservation_time, table_preference, status, notes")
    .eq("shop_id", session.shopId)
    .eq("reservation_date", selectedDate)
    .order("reservation_time", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reservations"
        action={
          <Link href="/restaurant/reservations/new" className="btn-primary-sm">
            + Book
          </Link>
        }
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M3 9h18M8 2v4M16 2v4" />
          </svg>
        }
      />
      <Link href="/restaurant" className="text-sm text-muted">
        ← Tables
      </Link>

      <form className="flex items-center gap-2" action="/restaurant/reservations">
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
        <Link href="/restaurant/reservations" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-brand">
          Today
        </Link>
      </form>

      {(!reservations || reservations.length === 0) ? (
        <EmptyState text="No reservations booked for this date." />
      ) : (
        <ul className="flex flex-col gap-2">
          {reservations.map((r) => (
            <ReservationRow
              key={r.id}
              reservation={{
                id: r.id,
                customerName: r.customer_name,
                customerPhone: r.customer_phone,
                partySize: r.party_size,
                time: r.reservation_time,
                tablePreference: r.table_preference,
                status: r.status,
                notes: r.notes,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
