import Link from "@/lib/link";
import { MapPinned } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { isoDaysAgo, todayIso } from "@/lib/dateHelpers";
import { formatMoney } from "@/lib/format";
import { loadTracks, loadTrips, loadVisitsBetween, tripSummaries } from "@/lib/van/data";
import { idleStops, OUTCOME_LABEL, routeKm, type VisitOutcome } from "@/lib/van/geo";
import { vanGate } from "../gate";

const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const time = (at: string | null) => (at ? new Date(at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : "—");
const day = (at: string) => new Date(at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const NOT_VISITED_DAYS = 14;

/** Route reports for a period: km and diesel by van, each trip's times, shops on the route that were
 * missed, shops not visited lately, repeated no-orders, and visits or bills made far from the shop. */
export default async function VanVisitsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const sp = await searchParams;
  const to = iso(sp.to) ?? todayIso();
  const from = iso(sp.from) && iso(sp.from)! <= to ? iso(sp.from)! : isoDaysAgo(6);
  const trips = (await loadTrips(admin, session, { from, to })).filter((x) => x.status !== "draft" && x.status !== "cancelled");
  const [summaries, { visits, pings }, lately, { data: parties }, { data: expenses }] = await Promise.all([
    tripSummaries(admin, session.shopId, trips),
    loadTracks(admin, session.shopId, trips.map((x) => x.id)),
    loadVisitsBetween(admin, session.shopId, isoDaysAgo(NOT_VISITED_DAYS - 1), todayIso()),
    admin.from("customers").select("id, name, beat" as never).eq("shop_id", session.shopId).not("beat" as never, "is", null).limit(5000),
    trips.length ? (admin as unknown as { from: (t: string) => ReturnType<typeof admin.from> }).from("van_expenses").select("trip_id, kind, amount").in("trip_id", trips.map((x) => x.id)) : Promise.resolve({ data: [] }),
  ]);
  const beatParties = (parties ?? []) as unknown as { id: string; name: string; beat: string }[];
  const byBeat = new Map<string, { id: string; name: string }[]>();
  for (const c of beatParties) byBeat.set(c.beat.trim().toLowerCase(), [...(byBeat.get(c.beat.trim().toLowerCase()) ?? []), c]);
  const diesel = (tripId: string) => ((expenses ?? []) as { trip_id: string; kind: string; amount: number }[]).filter((e) => e.trip_id === tripId && e.kind === "diesel").reduce((s, e) => s + Number(e.amount), 0);

  const rows = summaries.map((x) => {
    const tv = visits.filter((v) => v.tripId === x.id);
    const tp = pings.filter((p) => p.tripId === x.id);
    const route = x.route ? byBeat.get(x.route.trim().toLowerCase()) ?? [] : [];
    const seen = new Set(tv.map((v) => v.customerId));
    return {
      trip: x,
      visits: tv,
      km: routeKm(tp),
      diesel: diesel(x.id),
      start: tp.find((p) => p.source === "start")?.at ?? tp[0]?.at ?? x.loadedAt,
      end: [...tp].reverse().find((p) => p.source === "end")?.at ?? x.returnedAt,
      idle: idleStops(tp, []).length,
      missed: route.filter((c) => !seen.has(c.id)),
    };
  });

  const byVan = new Map<string, { name: string; km: number; diesel: number; trips: number }>();
  for (const r of rows) {
    const v = byVan.get(r.trip.vehicleId) ?? { name: r.trip.vehicleName, km: 0, diesel: 0, trips: 0 };
    v.km += r.km;
    v.diesel += r.diesel;
    v.trips += 1;
    byVan.set(r.trip.vehicleId, v);
  }
  const visitedLately = new Set(lately.map((v) => v.customerId));
  const notLately = beatParties.filter((c) => !visitedLately.has(c.id));
  const noOrder = new Map<string, { name: string; count: number }>();
  for (const v of visits) if (v.customerId && (v.outcome === "no_order" || v.outcome === "shop_closed" || v.outcome === "owner_absent")) noOrder.set(v.customerId, { name: v.customer ?? "Shop", count: (noOrder.get(v.customerId)?.count ?? 0) + 1 });
  const repeatNo = [...noOrder.values()].filter((x) => x.count >= 2).sort((a, b) => b.count - a.count);
  const far = visits.filter((v) => v.verified === false);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Route reports")} subtitle={t("Visits, missed shops, km and time")} icon={<MapPinned size={18} strokeWidth={1.8} />} />
      <DateRangeControls from={from} to={to} basePath="/van/visits" />

      <section className="neu-card flex flex-col gap-1 p-4 text-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Km by van")}</h2>
        {byVan.size === 0 && <p className="text-xs text-muted">{t("No trips in these dates.")}</p>}
        {[...byVan.values()].map((v) => (
          <div key={v.name} className="flex justify-between gap-2">
            <span className="text-foreground">
              {v.name} <span className="text-xs text-muted">· {v.trips} {t("trips")}</span>
            </span>
            <span className="text-muted">
              {v.km.toFixed(1)} km · {t("diesel")} {formatMoney(v.diesel)}
              {v.km > 0 && v.diesel > 0 ? ` · ${formatMoney(v.diesel / v.km)}/km` : ""}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-muted">{t("Km come from readings taken while the app was open, so they can be lower than the real distance.")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Trips")}</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">{t("Trip")}</th>
                <th className="px-2 py-2 font-medium">{t("Start")}</th>
                <th className="px-2 py-2 font-medium">{t("First shop")}</th>
                <th className="px-2 py-2 font-medium">{t("Last shop")}</th>
                <th className="px-2 py-2 font-medium">{t("End")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Visits")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Missed")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("Km")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Long stops")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.trip.id}>
                  <td className="px-3 py-1.5">
                    <Link href={`/van/trips/${r.trip.id}/map`} className="font-medium text-brand-text underline">
                      {r.trip.number}
                    </Link>
                    <span className="block text-[11px] text-muted">
                      {r.trip.vehicleName}
                      {r.trip.salesmanName ? ` · ${r.trip.salesmanName}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted">{time(r.start)}</td>
                  <td className="px-2 py-1.5 text-muted">{time(r.visits[0]?.checkInAt ?? null)}</td>
                  <td className="px-2 py-1.5 text-muted">{time(r.visits[r.visits.length - 1]?.checkInAt ?? null)}</td>
                  <td className="px-2 py-1.5 text-muted">{time(r.end ?? null)}</td>
                  <td className="px-2 py-1.5 text-right text-foreground">{r.visits.length}</td>
                  <td className={`px-2 py-1.5 text-right ${r.missed.length ? "font-semibold text-warning" : "text-muted"}`}>{r.missed.length}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{r.km.toFixed(1)}</td>
                  <td className={`px-3 py-1.5 text-right ${r.idle ? "font-semibold text-warning" : "text-muted"}`}>{r.idle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t("Visit register")} ({visits.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">{t("Shop")}</th>
                <th className="px-2 py-2 font-medium">{t("In – out")}</th>
                <th className="px-2 py-2 font-medium">{t("Outcome")}</th>
                <th className="px-3 py-2 font-medium">{t("At the shop?")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visits.map((v) => {
                const mins = v.checkOutAt ? Math.round((Date.parse(v.checkOutAt) - Date.parse(v.checkInAt)) / 60_000) : null;
                return (
                  <tr key={v.id}>
                    <td className="px-3 py-1.5 text-foreground">
                      {v.customer ?? "—"} <span className="text-[11px] text-muted">{day(v.checkInAt)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      {time(v.checkInAt)}
                      {v.checkOutAt ? ` – ${time(v.checkOutAt)} (${mins} ${t("min")})` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      {t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)}
                      {v.note ? ` · ${v.note}` : ""}
                    </td>
                    <td className={`px-3 py-1.5 ${v.verified === false ? "font-semibold text-danger" : "text-muted"}`}>{v.verified === null ? t("No pin or reading") : v.verified ? t("Yes") : `${t("No")} · ${v.distance} m`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {far.length > 0 && (
        <section className="neu-card flex flex-col gap-1 p-4 text-sm">
          <h2 className="text-sm font-semibold text-danger">
            {t("Visits and bills far from the shop")} ({far.length})
          </h2>
          {far.map((v) => (
            <p key={v.id} className="text-xs text-foreground">
              {v.customer ?? "—"} · {day(v.checkInAt)} {time(v.checkInAt)} · {t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)} · {v.distance} m {t("away")}
            </p>
          ))}
        </section>
      )}

      {repeatNo.length > 0 && (
        <section className="neu-card flex flex-col gap-1 p-4 text-sm">
          <h2 className="text-sm font-semibold text-foreground">{t("Shops with repeated no order / closed")}</h2>
          {repeatNo.map((x) => (
            <p key={x.name} className="text-xs text-foreground">
              {x.name} · {x.count} {t("times")}
            </p>
          ))}
        </section>
      )}

      <section className="neu-card flex flex-col gap-1 p-4 text-sm">
        <h2 className="text-sm font-semibold text-foreground">
          {t("Route shops not visited in the last {n} days", { n: NOT_VISITED_DAYS })} ({notLately.length})
        </h2>
        <p className="text-xs text-muted">{notLately.length ? notLately.map((c) => `${c.name} (${c.beat})`).join(", ") : t("Every shop on a beat was visited.")}</p>
      </section>
    </div>
  );
}
