import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadRouteShops, loadTracks, loadTrip } from "@/lib/van/data";
import { mayWorkTrip } from "@/lib/van/rules";
import { vanGate, Notice } from "../../../gate";
import { TripMapClient } from "./TripMapClient";

/** A trip on the map: the van's path from its location readings, each visit numbered with what came of
 * it, the route's shops by status, and the trip's km and times. */
export default async function TripMapPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await vanGate(false);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const full = await loadTrip(admin, session, id);
  if (!full) notFound();
  if (!mayWorkTrip(session.role, session.userId, full.trip.salesmanId)) return <Notice title={t("Not your trip")} text={t("Only this trip's salesman, the owner or a manager can open it.")} />;
  const { visits, pings } = await loadTracks(admin, session.shopId, [id]);
  const extra = [...new Set(visits.map((v) => v.customerId).filter((x): x is string => !!x))];
  const shops = await loadRouteShops(admin, session.shopId, full.trip.route, extra);
  const totals = new Map(full.bills.filter((b) => b.status === "active").map((b) => [b.id, b.total]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={`/van/trips/${id}`} />
      <PageHeader title={t("Trip map")} subtitle={`${full.trip.vehicleName} · ${full.trip.number}`} icon={<MapPin size={18} strokeWidth={1.8} />} />
      <TripMapClient shops={shops} visits={visits} pings={pings} billTotals={Object.fromEntries(totals)} trip={{ loadedAt: full.trip.loadedAt, returnedAt: full.trip.returnedAt, diesel: full.expenses.filter((e) => e.kind === "diesel").reduce((s, e) => s + e.amount, 0) }} />
    </div>
  );
}
