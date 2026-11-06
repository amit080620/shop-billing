import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadOpenTrips, loadPlaces, loadStaff, loadStockByPlace } from "@/lib/van/data";
import { vanGate, Notice } from "../../gate";
import { NewTripClient } from "./NewTripClient";

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ van?: string }> }) {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { van } = await searchParams;
  const [{ vans, main }, staff, open, stock] = await Promise.all([loadPlaces(admin, session.shopId), loadStaff(admin, session.shopId), loadOpenTrips(admin, session), loadStockByPlace(admin, session.shopId)]);
  const busy = new Set(open.map((x) => x.vehicleId));
  const free = vans.filter((v) => v.isActive && !busy.has(v.id));
  if (!main || vans.length === 0) return <Notice title={t("Add a van first")} text={t("Vans → Add a van. That also sets up your main godown.")} />;
  const { data: barcodes } = await admin.from("products").select("id, barcode").eq("shop_id", session.shopId).not("barcode", "is", null);
  const barcode = new Map((barcodes ?? []).map((b) => [b.id, b.barcode]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Load a van")} subtitle={t("Goods move from {godown} onto the van", { godown: main.name })} icon={<Truck size={18} strokeWidth={1.8} />} />
      {free.length === 0 ? (
        <Notice title={t("Every van is out")} text={t("Settle a van's trip before loading it again.")} />
      ) : (
        <NewTripClient
          vans={free}
          staff={staff}
          initialVan={free.some((v) => v.id === van) ? van! : free[0].id}
          items={stock.rows
            .map((r) => ({ id: r.id, name: r.name, unit: r.unit, barcode: barcode.get(r.id) ?? null, available: r.byPlace.get(main.id) ?? 0 }))
            .filter((i) => i.available > 0)}
        />
      )}
    </div>
  );
}
