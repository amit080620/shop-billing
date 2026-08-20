import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { BarChart3 } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

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
  const { t } = await getTranslator();
  const { from, to } = await searchParams;
  const fromDate = from || startOfMonthIso();
  const toDate = to || todayIso();

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00`);
  const endOfRange = new Date(`${toDate}T23:59:59.999`);

  const { data: trips } = await admin
    .from("transport_trips")
    .select("id, vehicle_id, km, transport_charge, driver_name, load_weight, load_unit, trip_date, created_at, vehicles ( name, vehicle_number )")
    .eq("shop_id", session.shopId)
    .gte("created_at", startOfRange.toISOString())
    .lte("created_at", endOfRange.toISOString())
    .order("created_at", { ascending: false });

  type VehicleTotals = { name: string; vehicleNumber: string | null; rounds: number; totalKm: number; totalEarnings: number; loadByUnit: Record<string, number> };
  const byVehicle = new Map<string, VehicleTotals>();
  for (const trip of trips ?? []) {
    const vehicle = Array.isArray(trip.vehicles) ? trip.vehicles[0] : trip.vehicles;
    const existing = byVehicle.get(trip.vehicle_id) ?? {
      name: vehicle?.name ?? "Vehicle",
      vehicleNumber: vehicle?.vehicle_number ?? null,
      rounds: 0,
      totalKm: 0,
      totalEarnings: 0,
      loadByUnit: {} as Record<string, number>,
    };
    existing.rounds += 1;
    existing.totalKm += Number(trip.km);
    existing.totalEarnings += Number(trip.transport_charge);
    if (trip.load_weight && trip.load_unit) {
      existing.loadByUnit[trip.load_unit] = (existing.loadByUnit[trip.load_unit] ?? 0) + Number(trip.load_weight);
    }
    byVehicle.set(trip.vehicle_id, existing);
  }
  const vehicleRows = [...byVehicle.values()].sort((a, b) => b.totalEarnings - a.totalEarnings);

  type DriverTotals = { name: string; rounds: number; totalKm: number; totalEarnings: number };
  const byDriver = new Map<string, DriverTotals>();
  for (const trip of trips ?? []) {
    if (!trip.driver_name?.trim()) continue;
    const key = trip.driver_name.trim();
    const existing = byDriver.get(key) ?? { name: key, rounds: 0, totalKm: 0, totalEarnings: 0 };
    existing.rounds += 1;
    existing.totalKm += Number(trip.km);
    existing.totalEarnings += Number(trip.transport_charge);
    byDriver.set(key, existing);
  }
  const driverRows = [...byDriver.values()].sort((a, b) => b.rounds - a.rounds);

  const grandTotalEarnings = vehicleRows.reduce((s, v) => s + v.totalEarnings, 0);
  const grandTotalRounds = vehicleRows.reduce((s, v) => s + v.rounds, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("treports.title")}
        subtitle={t("treports.subtitle")}
        icon={<BarChart3 size={18} strokeWidth={1.8} />}
      />
      <Link href="/transport/vehicles" className="text-sm text-muted">
        {t("treports.backToVehicles")}
      </Link>

      <form className="flex items-center gap-2" action="/transport/reports">
        <input type="date" name="from" defaultValue={fromDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <span className="text-xs text-muted">{t("treports.to")}</span>
        <input type="date" name="to" defaultValue={toDate} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          {t("treports.go")}
        </button>
      </form>

      <div className="neu-card p-4 text-center">
        <p className="text-xs text-muted">{fromDate} → {toDate}</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{formatMoney(grandTotalEarnings)}</p>
        <p className="text-xs text-muted">{t("treports.roundsAcrossAll", { count: grandTotalRounds })}</p>
      </div>

      {vehicleRows.length === 0 ? (
        <EmptyState text={t("treports.empty")} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {vehicleRows.map((v) => {
              const loadEntries = Object.entries(v.loadByUnit);
              return (
                <li key={v.name} className="neu-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{v.name}</p>
                      {v.vehicleNumber && <p className="text-xs text-muted">{v.vehicleNumber}</p>}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatMoney(v.totalEarnings)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted">{t("treports.roundsKm", { rounds: v.rounds, km: v.totalKm.toLocaleString("en-IN") })}</p>
                  {loadEntries.length > 0 && (
                    <p className="text-xs text-muted">
                      {t("treports.carried", { list: loadEntries.map(([unit, qty]) => `${qty.toLocaleString("en-IN")} ${unit}`).join(", ") })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {driverRows.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">{t("treports.byDriver")}</p>
              <ul className="flex flex-col gap-2">
                {driverRows.map((d) => (
                  <li key={d.name} className="neu-card flex items-center justify-between px-3.5 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                      <p className="text-xs text-muted">{t("treports.driverRoundsKm", { rounds: d.rounds, km: d.totalKm.toLocaleString("en-IN") })}</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{formatMoney(d.totalEarnings)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
