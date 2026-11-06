import { MapPin } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadLivePositions, loadPins } from "@/lib/van/data";
import { vanGate } from "../gate";
import { LiveMapClient } from "./LiveMapClient";

/** The owner's map: where each van on the route was last seen, every shop's pin (drag to move it,
 * approve one a salesman saved), and shops still without a pin to place with a tap. */
export default async function VanMapPage() {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [live, pins, { data: parties }] = await Promise.all([
    loadLivePositions(admin, session),
    loadPins(admin, session.shopId),
    admin.from("customers").select("id, name, beat" as never).eq("shop_id", session.shopId).not("beat" as never, "is", null).order("name").limit(2000),
  ]);
  const rows = ((parties ?? []) as unknown as { id: string; name: string; beat: string | null }[]).map((c) => {
    const p = pins.get(c.id);
    return { id: c.id, name: c.name, beat: c.beat, lat: p?.lat ?? null, lng: p?.lng ?? null, verified: p?.verified ?? false };
  });
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Live map")} subtitle={t("Vans on the route and your shops' pins")} icon={<MapPin size={18} strokeWidth={1.8} />} />
      <LiveMapClient live={live.map((l) => ({ id: l.trip.id, label: `${l.trip.vehicleName}${l.trip.salesmanName ? ` · ${l.trip.salesmanName}` : ""}`, at: l.at, lat: l.lat, lng: l.lng }))} shops={rows} />
    </div>
  );
}
