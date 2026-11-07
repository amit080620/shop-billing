import Link from "@/lib/link";
import { BarChart3, Boxes, MapPin, MapPinned, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso, isoDaysAgo } from "@/lib/dateHelpers";
import { formatDateTime } from "@/lib/format";
import { loadPlaces, loadTrips, loadVanDay } from "@/lib/van/data";
import { STATUS_LABEL } from "@/lib/van/rules";
import { vanGate } from "./gate";
import { DayBoard, boardDate } from "./DayBoard";

/** The Van desk (the Van tab of a wholesale shop that runs vans): today's vans on one board — the cash
 * and UPI to come in, the stock still out, "Settle now" on a van that is back, one-tap WhatsApp summary
 * — then the vans ready to load and the van screens. A salesman sees his own van, with bill, route and
 * return a tap away. */
export default async function VanHomePage() {
  const gate = await vanGate(false);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const [{ vans, main }, day, recent] = await Promise.all([
    loadPlaces(admin, session.shopId),
    loadVanDay(admin, session, { mine: !canManage }),
    loadTrips(admin, session, { from: isoDaysAgo(6), to: todayIso(), mine: !canManage }),
  ]);
  const out = new Set(day.trips.filter((x) => x.status !== "settled").map((x) => x.vehicleId));
  const atGodown = vans.filter((v) => v.isActive && !out.has(v.id));
  const recentDone = recent.filter((x) => !day.trips.some((d) => d.id === x.id));

  return (
    <div className="flex flex-col gap-4">
      {/* A tab once the shop has vans; until then it is reached from More. */}
      {vans.length === 0 && <BackLink fallback="/more" />}
      <PageHeader title={t("Van desk")} subtitle={t("Load in the morning, bill from the van, settle in the evening")} icon={<Truck size={18} strokeWidth={1.8} />} />

      {day.trips.length > 0 ? (
        <DayBoard trips={day.trips} totals={day.totals} t={t} canManage={canManage} dateLabel={boardDate()} />
      ) : !canManage ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No open trip for you. The godown loads your van and opens the trip.")}</p>
      ) : vans.length > 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">{t("No van out today. Load one below; its cash and stock show here all day.")}</p>
      ) : null}

      {canManage && vans.length === 0 && (
        <div className="neu-card flex flex-col gap-2 p-4 text-sm">
          <p className="font-semibold text-foreground">{t("Start by adding your vans")}</p>
          <p className="text-muted">{t("Each van is a godown on wheels. Your shop's stock stays in the main godown; a trip moves goods onto a van and back.")}</p>
          <Link href="/van/vans" className="btn-primary-sm self-start">
            {t("Add a van")}
          </Link>
        </div>
      )}

      {canManage && atGodown.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("Ready to load")}</h2>
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
            {atGodown.map((v) => (
              <li key={v.id} className="neu-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {v.name} <span className="text-xs font-normal text-muted">{v.vehicleNumber ?? v.code}</span>
                  </p>
                  <p className="truncate text-xs text-muted">{t("At the godown")}</p>
                </div>
                <Link href={`/van/trips/new?van=${v.id}`} className="btn-primary-sm flex shrink-0 items-center gap-1">
                  <Plus size={14} /> {t("Load")}
                </Link>
              </li>
            ))}
          </ul>
          {!main && <p className="text-xs text-warning">{t("No main godown yet — it is made when you add a van.")}</p>}
        </section>
      )}

      {canManage && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Link href="/van/vans" className="neu-card flex flex-col items-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <Truck size={18} /> {t("Vans")}
          </Link>
          <Link href="/van/stock" className="neu-card flex flex-col items-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <Boxes size={18} /> {t("Stock by place")}
          </Link>
          <Link href="/van/reports" className="neu-card flex flex-col items-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <BarChart3 size={18} /> {t("Reports")}
          </Link>
          <Link href="/van/map" className="neu-card flex flex-col items-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <MapPin size={18} /> {t("Live map")}
          </Link>
          <Link href="/van/visits" className="neu-card flex flex-col items-center gap-1 p-3 text-center text-xs font-medium text-foreground">
            <MapPinned size={18} /> {t("Route reports")}
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Trips in the last 7 days")}</h2>
        {recentDone.length === 0 && <p className="text-xs text-muted">{t("None yet.")}</p>}
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {recentDone.map((x) => (
            <li key={x.id}>
              <Link href={`/van/trips/${x.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {x.number} · {x.vehicleName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatDateTime(x.createdAt)}
                    {x.salesmanName ? ` · ${x.salesmanName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{t(STATUS_LABEL[x.status])}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
