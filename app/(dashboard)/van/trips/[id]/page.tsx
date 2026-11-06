import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadRouteShops, loadStockByPlace, loadTracks, loadTrip } from "@/lib/van/data";
import { mayWorkTrip } from "@/lib/van/rules";
import { vanGate, Notice } from "../../gate";
import { TripClient } from "./TripClient";

/** One trip: its load, the van's stock, bills and expenses, and the settlement. The salesman sees and
 * does his part (bill, expenses, back); the owner or a manager loads, tops up and settles. */
export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await vanGate(false);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const full = await loadTrip(admin, session, id);
  if (!full) notFound();
  const mayWork = mayWorkTrip(session.role, session.userId, full.trip.salesmanId);
  if (!mayWork) return <Notice title={t("Not your trip")} text={t("Only this trip's salesman, the owner or a manager can open it.")} />;
  const { visits } = await loadTracks(admin, session.shopId, [full.trip.id]);
  const { data: billCustomers } = await admin.from("bills").select("customer_id").eq("van_trip_id" as never, full.trip.id).not("customer_id", "is", null);
  const extra = [...new Set([...visits.map((v) => v.customerId), ...(billCustomers ?? []).map((b) => b.customer_id)].filter((x): x is string => !!x))];
  const shops = await loadRouteShops(admin, session.shopId, full.trip.route, extra);
  let loadItems: { id: string; name: string; unit: string; barcode: string | null; available: number }[] = [];
  if (canManage && (full.trip.status === "draft" || full.trip.status === "loaded")) {
    const stock = await loadStockByPlace(admin, session.shopId);
    loadItems = stock.rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, barcode: null, available: r.byPlace.get(full.trip.sourceId) ?? 0 })).filter((i) => i.available > 0);
  }
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={`${full.trip.vehicleName} · ${full.trip.number}`} subtitle={[full.trip.salesmanName, full.trip.route].filter(Boolean).join(" · ") || t("Van trip")} icon={<Truck size={18} strokeWidth={1.8} />} />
      <TripClient data={JSON.parse(JSON.stringify(full))} canManage={canManage} loadItems={loadItems} shops={shops} visits={visits} />
    </div>
  );
}
