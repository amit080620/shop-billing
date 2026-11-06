"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { GOOD_ACCURACY_M, idleStops, OUTCOME_LABEL, routeKm, type VisitOutcome } from "@/lib/van/geo";
import type { PingRow, RouteShop, Visit } from "@/lib/van/data";
import { MapLazy } from "../../../MapLazy";

const COLOR = { billed: "#16a34a", visited: "#f59e0b", pending: "#94a3b8", far: "#dc2626" };
const time = (at: string | null) => (at ? new Date(at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : "—");

export function TripMapClient({ shops, visits, pings, billTotals, trip }: { shops: RouteShop[]; visits: Visit[]; pings: PingRow[]; billTotals: Record<string, number>; trip: { loadedAt: string | null; returnedAt: string | null; diesel: number } }) {
  const { t } = useT();
  const last = useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of visits) if (v.customerId) m.set(v.customerId, v);
    return m;
  }, [visits]);
  const good = pings.filter((p) => p.accuracy === null || p.accuracy <= GOOD_ACCURACY_M);
  const km = routeKm(pings);
  const idle = idleStops(pings, shops.filter((s) => s.lat !== null).map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, radius: s.radius })));
  const start = pings.find((p) => p.source === "start")?.at ?? pings[0]?.at ?? trip.loadedAt;
  const end = [...pings].reverse().find((p) => p.source === "end")?.at ?? trip.returnedAt;
  const missed = shops.filter((s) => !last.has(s.id));

  const pins = shops
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => {
      const v = last.get(s.id);
      const color = !v ? COLOR.pending : v.verified === false ? COLOR.far : v.outcome === "billed" ? COLOR.billed : COLOR.visited;
      return { id: s.id, lat: s.lat!, lng: s.lng!, color, label: `${s.name}${v ? ` · ${t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)}` : ` · ${t("Not visited")}`}` };
    });
  const dots = visits
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v, i) => ({ lat: v.lat!, lng: v.lng!, color: v.verified === false ? COLOR.far : "#0f172a", label: `${i + 1}. ${time(v.checkInAt)} · ${v.customer ?? t("Shop")} · ${t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)}${v.billId && billTotals[v.billId] ? ` · ${formatMoney(billTotals[v.billId])}` : ""}` }));

  return (
    <div className="flex flex-col gap-3">
      <MapLazy pins={pins} path={good.map((p) => ({ lat: p.lat, lng: p.lng }))} dots={dots} />
      <div className="flex flex-wrap gap-3 text-[11px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.billed }} />
          {t("Billed")}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.visited }} />
          {t("Visited, no bill")}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.pending }} />
          {t("Not visited")}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.far }} />
          {t("Far from the shop")}
        </span>
      </div>

      <section className="neu-card grid grid-cols-2 gap-2 p-4 text-sm">
        <Fig label={t("Km travelled")} value={`${km} km`} />
        <Fig label={t("Diesel spent")} value={formatMoney(trip.diesel)} />
        <Fig label={t("Trip start")} value={time(start)} />
        <Fig label={t("First shop")} value={time(visits[0]?.checkInAt ?? null)} />
        <Fig label={t("Last shop")} value={time(visits[visits.length - 1]?.checkInAt ?? null)} />
        <Fig label={t("Trip end")} value={time(end ?? null)} />
        <Fig label={t("Shops visited")} value={`${last.size} / ${shops.length}`} />
        <Fig label={t("Location readings")} value={String(pings.length)} />
      </section>

      {idle.length > 0 && (
        <section className="neu-card flex flex-col gap-1 p-4 text-sm">
          <h2 className="text-sm font-semibold text-foreground">{t("Long stops away from shops")}</h2>
          {idle.map((s) => (
            <p key={s.from} className="text-xs text-muted">
              {time(s.from)} – {time(s.to)} · {s.minutes} {t("min")}
            </p>
          ))}
        </section>
      )}

      <section className="neu-card flex flex-col gap-1 p-4 text-sm">
        <h2 className="text-sm font-semibold text-foreground">
          {t("Visits")} ({visits.length})
        </h2>
        {visits.length === 0 && <p className="text-xs text-muted">{t("No visits recorded.")}</p>}
        {visits.map((v, i) => (
          <div key={v.id} className="flex justify-between gap-2 border-b border-border py-1 text-xs last:border-0">
            <span className="min-w-0 text-foreground">
              {i + 1}. {v.customer ?? t("Shop")} <span className="text-muted">· {time(v.checkInAt)}{v.checkOutAt ? `–${time(v.checkOutAt)}` : ""}</span>
            </span>
            <span className={`shrink-0 ${v.verified === false ? "font-semibold text-danger" : "text-muted"}`}>
              {t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)}
              {v.verified === false && v.distance !== null ? ` · ${v.distance} m ${t("away")}` : ""}
            </span>
          </div>
        ))}
      </section>

      {missed.length > 0 && (
        <section className="neu-card flex flex-col gap-1 p-4 text-sm">
          <h2 className="text-sm font-semibold text-foreground">
            {t("Route shops not visited")} ({missed.length})
          </h2>
          <p className="text-xs text-muted">{missed.map((s) => s.name).join(", ")}</p>
        </section>
      )}
      <p className="text-[11px] text-muted">{t("Readings are taken only while the app is open on the salesman's phone, so a path can have gaps.")}</p>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
