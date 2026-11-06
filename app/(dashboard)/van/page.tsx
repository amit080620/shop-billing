import Link from "@/lib/link";
import { BarChart3, Boxes, MapPin, MapPinned, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso, isoDaysAgo } from "@/lib/dateHelpers";
import { formatDateTime } from "@/lib/format";
import { loadOpenTrips, loadPlaces, loadTrips } from "@/lib/van/data";
import { STATUS_LABEL } from "@/lib/van/rules";
import { vanGate } from "./gate";

/** Van sales: what each van is doing now, the trips of the last week, and the way to start one. A
 * salesman sees his own open trips. */
export default async function VanHomePage() {
  const gate = await vanGate(false);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const [{ vans, main }, open, recent] = await Promise.all([
    loadPlaces(admin, session.shopId),
    loadOpenTrips(admin, session),
    loadTrips(admin, session, { from: isoDaysAgo(6), to: todayIso(), mine: !canManage }),
  ]);
  const mine = canManage ? open : open.filter((x) => x.salesmanId === session.userId);
  const openByVan = new Map(open.map((x) => [x.vehicleId, x]));

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/more" />
      <PageHeader title={t("Van sales")} subtitle={t("Load in the morning, bill from the van, settle in the evening")} icon={<Truck size={18} strokeWidth={1.8} />} />

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

      {canManage && vans.length === 0 && (
        <div className="neu-card flex flex-col gap-2 p-4 text-sm">
          <p className="font-semibold text-foreground">{t("Start by adding your vans")}</p>
          <p className="text-muted">{t("Each van is a godown on wheels. Your shop's stock stays in the main godown; a trip moves goods onto a van and back.")}</p>
          <Link href="/van/vans" className="btn-primary-sm self-start">
            {t("Add a van")}
          </Link>
        </div>
      )}

      {canManage && vans.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("Vans now")}</h2>
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
            {vans
              .filter((v) => v.isActive)
              .map((v) => {
                const trip = openByVan.get(v.id);
                return (
                  <li key={v.id} className="neu-card flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {v.name} <span className="text-xs font-normal text-muted">{v.vehicleNumber ?? v.code}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{trip ? `${trip.number} · ${t(STATUS_LABEL[trip.status])}${trip.salesmanName ? ` · ${trip.salesmanName}` : ""}` : t("At the godown")}</p>
                    </div>
                    {trip ? (
                      <Link href={`/van/trips/${trip.id}`} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                        {t("Open trip")}
                      </Link>
                    ) : (
                      <Link href={`/van/trips/new?van=${v.id}`} className="btn-primary-sm flex shrink-0 items-center gap-1">
                        <Plus size={14} /> {t("Load")}
                      </Link>
                    )}
                  </li>
                );
              })}
          </ul>
          {!main && <p className="text-xs text-warning">{t("No main godown yet — it is made when you add a van.")}</p>}
        </section>
      )}

      {!canManage && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("Your trips today")}</h2>
          {mine.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No open trip for you. The godown loads your van and opens the trip.")}</p>}
          <ul className="flex flex-col gap-2">
            {mine.map((x) => (
              <li key={x.id}>
                <Link href={`/van/trips/${x.id}`} className="neu-card flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{x.vehicleName}</span>
                    <span className="block truncate text-xs text-muted">
                      {x.number} · {t(STATUS_LABEL[x.status])}
                      {x.route ? ` · ${x.route}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Trips in the last 7 days")}</h2>
        {recent.length === 0 && <p className="text-xs text-muted">{t("None yet.")}</p>}
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {recent.map((x) => (
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
