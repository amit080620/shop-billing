import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { BarChart3, Lock } from "lucide-react";
import { isModuleEnabled } from "@/lib/modules";
import { minPlanForModule, planFor } from "@/lib/plans";
import { todayIso } from "@/lib/dateHelpers";
import { BackLink } from "@/app/components/BackLink";
import { transportExtrasReady, lrTotal, type Consignment } from "@/lib/transportData";
import { EXPENSE_CATEGORIES, EXPENSE_LABEL, vehicleFigures, type ExpenseCategory } from "@/lib/transport";

/** Each vehicle's rounds, km and earnings for a period — and, with trip expenses and bilties
 * (migration 0049), what it cost to run and the profit it really made. */
export default async function TransportReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const { from, to } = await searchParams;
  const today = todayIso();
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : `${today.slice(0, 7)}-01`;
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;

  const admin = createSupabaseAdminClient();
  const startOfRange = new Date(`${fromDate}T00:00:00+05:30`);
  const endOfRange = new Date(`${toDate}T23:59:59.999+05:30`);
  const extras = await transportExtrasReady(admin);
  // Running costs and profit come with the vehicle-expenses module; trips and earnings are for all.
  const profitOn = isModuleEnabled(session.enabledModules, "vehicle_profit");

  const [{ data: trips }, { data: vehicles }, lrRes, expRes] = await Promise.all([
    admin
      .from("transport_trips")
      .select("id, vehicle_id, km, transport_charge, driver_name, load_weight, load_unit, bills ( status )")
      .eq("shop_id", session.shopId)
      .gte("created_at", startOfRange.toISOString())
      .lte("created_at", endOfRange.toISOString()),
    admin.from("vehicles").select("id, name, vehicle_number").eq("shop_id", session.shopId).order("name"),
    extras
      ? admin.from("consignments").select("*").eq("shop_id", session.shopId).neq("status", "cancelled").gte("lr_date", fromDate).lte("lr_date", toDate)
      : Promise.resolve({ data: [] as Consignment[] }),
    extras && profitOn
      ? admin.from("trip_expenses").select("vehicle_id, category, amount, litres, odometer_km").eq("shop_id", session.shopId).gte("expense_date", fromDate).lte("expense_date", toDate)
      : Promise.resolve({ data: [] as { vehicle_id: string | null; category: string; amount: number; litres: number | null; odometer_km: number | null }[] }),
  ]);
  // A trip on a voided bill never happened as far as the money goes.
  const liveTrips = (trips ?? []).filter((tr) => (Array.isArray(tr.bills) ? tr.bills[0] : tr.bills)?.status !== "voided");
  const lrs = (lrRes.data ?? []) as Consignment[];
  const expenses = expRes.data ?? [];

  const rows = (vehicles ?? [])
    .map((v) => {
      const own = liveTrips.filter((tr) => tr.vehicle_id === v.id);
      const ownLrs = lrs.filter((c) => c.vehicle_id === v.id);
      const ownExp = expenses.filter((e) => e.vehicle_id === v.id);
      const loadByUnit: Record<string, number> = {};
      for (const tr of own) if (tr.load_weight && tr.load_unit) loadByUnit[tr.load_unit] = (loadByUnit[tr.load_unit] ?? 0) + Number(tr.load_weight);
      const figures = vehicleFigures({
        tripCharges: own.map((tr) => Number(tr.transport_charge)),
        tripKm: own.map((tr) => Number(tr.km)),
        freight: ownLrs.map((c) => lrTotal(c)),
        expenses: ownExp.map((e) => ({ category: e.category as ExpenseCategory, amount: Number(e.amount), litres: e.litres != null ? Number(e.litres) : null, odometer: e.odometer_km != null ? Number(e.odometer_km) : null })),
      });
      return { id: v.id, name: v.name, vehicleNumber: v.vehicle_number, rounds: own.length, lrs: ownLrs.length, loadByUnit, figures };
    })
    .filter((r) => r.rounds > 0 || r.lrs > 0 || r.figures.expenses > 0)
    .sort((a, b) => b.figures.profit - a.figures.profit);
  const noVehicleSpend = expenses.filter((e) => !e.vehicle_id).reduce((s, e) => s + Number(e.amount), 0);

  type DriverTotals = { name: string; rounds: number; totalKm: number; totalEarnings: number };
  const byDriver = new Map<string, DriverTotals>();
  for (const trip of liveTrips) {
    if (!trip.driver_name?.trim()) continue;
    const key = trip.driver_name.trim();
    const existing = byDriver.get(key) ?? { name: key, rounds: 0, totalKm: 0, totalEarnings: 0 };
    existing.rounds += 1;
    existing.totalKm += Number(trip.km);
    existing.totalEarnings += Number(trip.transport_charge);
    byDriver.set(key, existing);
  }
  const driverRows = [...byDriver.values()].sort((a, b) => b.rounds - a.rounds);

  const earned = rows.reduce((s, r) => s + r.figures.earnings, 0);
  const spent = rows.reduce((s, r) => s + r.figures.expenses, 0) + noVehicleSpend;
  const rounds = rows.reduce((s, r) => s + r.rounds, 0);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/transport" />
      <PageHeader title={t("treports.title")} subtitle={t("Earnings, running costs and profit — vehicle by vehicle")} icon={<BarChart3 size={18} strokeWidth={1.8} />} />
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

      <div className={`grid gap-2 ${profitOn ? "grid-cols-3" : "grid-cols-1"}`}>
        <div className="neu-card p-3 text-center">
          <p className="text-[11px] text-muted">{t("Earned")}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatMoney(earned)}</p>
        </div>
        {profitOn && (
        <>
        <div className="neu-card p-3 text-center">
          <p className="text-[11px] text-muted">{t("Spent")}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatMoney(spent)}</p>
        </div>
        <div className="neu-card p-3 text-center">
          <p className="text-[11px] text-muted">{t("Profit")}</p>
          <p className={`mt-0.5 text-sm font-bold ${earned - spent >= 0 ? "text-success" : "text-danger"}`}>{formatMoney(earned - spent)}</p>
        </div>
        </>
        )}
      </div>
      <p className="text-center text-xs text-muted">{t("treports.roundsAcrossAll", { count: rounds })}</p>

      {!extras && <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">{t("Vehicle expenses need a one-time database update (migration 0049).")}</p>}
      {extras && !profitOn && (
        <Link href="/plans" className="flex items-center gap-2 rounded-xl border border-dashed border-brand bg-brand-soft px-3.5 py-3 text-xs text-brand-text">
          <Lock size={14} className="shrink-0" />
          {t("See each vehicle's running cost, real profit and diesel average with the {plan} plan →", { plan: planFor(minPlanForModule("vehicle_profit")).name })}
        </Link>
      )}

      {rows.length === 0 ? (
        <EmptyState text={t("treports.empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((v) => {
            const f = v.figures;
            const loads = Object.entries(v.loadByUnit);
            return (
              <li key={v.id} className="neu-card flex flex-col gap-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{v.name}</p>
                    <p className="text-xs text-muted">
                      {v.vehicleNumber ? `${v.vehicleNumber} · ` : ""}
                      {t("treports.roundsKm", { rounds: v.rounds, km: f.km.toLocaleString("en-IN") })}
                      {v.lrs ? ` · ${t("{n} LR", { n: v.lrs })}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-base font-bold ${!profitOn ? "text-foreground" : f.profit >= 0 ? "text-success" : "text-danger"}`}>{formatMoney(profitOn ? f.profit : f.earnings)}</p>
                    <p className="text-[11px] text-muted">{profitOn ? t("profit") : t("earned")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-muted">{t("Earned")}</span>
                  <span className="text-right font-medium text-foreground">{formatMoney(f.earnings)}</span>
                  {EXPENSE_CATEGORIES.filter((c) => f.byCategory[c]).map((c) => (
                    <span key={c} className="contents">
                      <span className="text-muted">− {t(EXPENSE_LABEL[c])}</span>
                      <span className="text-right text-foreground">{formatMoney(f.byCategory[c] ?? 0)}</span>
                    </span>
                  ))}
                </div>
                {(f.costPerKm != null || f.average) && (
                  <p className="text-xs text-brand-text">
                    {f.costPerKm != null && f.expenses > 0 ? t("Costs {amount} per km", { amount: formatMoney(f.costPerKm) }) : ""}
                    {f.costPerKm != null && f.expenses > 0 && f.average ? " · " : ""}
                    {f.average ? t("Diesel average {avg} km/litre", { avg: f.average.kmPerLitre }) : ""}
                  </p>
                )}
                {loads.length > 0 && <p className="text-xs text-muted">{t("treports.carried", { list: loads.map(([unit, qty]) => `${qty.toLocaleString("en-IN")} ${unit}`).join(", ") })}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {noVehicleSpend > 0 && <p className="text-xs text-muted">{t("{amount} spent without a vehicle picked.", { amount: formatMoney(noVehicleSpend) })}</p>}

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
    </div>
  );
}
