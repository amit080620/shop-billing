import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function TransportReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { from, to } = await searchParams;
  const fromDate = from || startOfMonthIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  const { data: trips } = await admin
    .from("transport_trips")
    .select("id, vehicle_id, km, transport_charge, trip_date, created_at, vehicles ( name, vehicle_number )")
    .eq("shop_id", session.shopId)
    .gte("created_at", startOfRange.toISOString())
    .lte("created_at", endOfRange.toISOString())
    .order("created_at", { ascending: false });

  type VehicleTotals = { name: string; vehicleNumber: string | null; rounds: number; totalKm: number; totalEarnings: number };
  const byVehicle = new Map<string, VehicleTotals>();
  for (const trip of trips ?? []) {
    const vehicle = Array.isArray(trip.vehicles) ? trip.vehicles[0] : trip.vehicles;
    const existing = byVehicle.get(trip.vehicle_id) ?? {
      name: vehicle?.name ?? "Vehicle",
      vehicleNumber: vehicle?.vehicle_number ?? null,
      rounds: 0,
      totalKm: 0,
      totalEarnings: 0,
    };
    existing.rounds += 1;
    existing.totalKm += Number(trip.km);
    existing.totalEarnings += Number(trip.transport_charge);
    byVehicle.set(trip.vehicle_id, existing);
  }
  const vehicleRows = [...byVehicle.values()].sort((a, b) => b.totalEarnings - a.totalEarnings);

  const grandTotalEarnings = vehicleRows.reduce((s, v) => s + v.totalEarnings, 0);
  const grandTotalRounds = vehicleRows.reduce((s, v) => s + v.rounds, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vehicle-wise trips"
        subtitle="Rounds, distance, and earnings per vehicle."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 13h13l3 4h2v3H3v-7Z" />
            <path d="M16 13V8H6l-3 5" />
            <circle cx="7" cy="19" r="1.5" />
            <circle cx="17" cy="19" r="1.5" />
          </svg>
        }
      />
      <Link href="/transport/vehicles" className="text-sm text-muted">
        ← Vehicles
      </Link>

      <form className="flex items-center gap-2" action="/transport/reports">
        <input type="date" name="from" defaultValue={fromDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <span className="text-xs text-muted">to</span>
        <input type="date" name="to" defaultValue={toDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4 text-center">
        <p className="text-xs text-muted">{fromDate} → {toDate}</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(grandTotalEarnings)}</p>
        <p className="text-xs text-muted">{grandTotalRounds} round(s) across all vehicles</p>
      </div>

      {vehicleRows.length === 0 ? (
        <EmptyState text="No trips recorded in this range." />
      ) : (
        <ul className="flex flex-col gap-2">
          {vehicleRows.map((v) => (
            <li key={v.name} className="rounded-xl border border-border bg-surface shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{v.name}</p>
                  {v.vehicleNumber && <p className="text-xs text-muted">{v.vehicleNumber}</p>}
                </div>
                <p className="text-sm font-semibold text-foreground">{formatMoney(v.totalEarnings)}</p>
              </div>
              <p className="mt-1 text-xs text-muted">{v.rounds} round(s) · {v.totalKm.toLocaleString("en-IN")} km total</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
