import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { garmentGate } from "../../gate";
import { NewTransferClient } from "./NewTransferClient";

export default async function NewTransferPage() {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [godowns, grid] = await Promise.all([loadGodowns(admin, session.shopId), loadStockGrid(admin, session.shopId)]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/transfers" />
      <PageHeader title={t("New transfer")} subtitle={t("Saved as a draft; stock moves only when it is dispatched")} icon={<Truck size={18} strokeWidth={1.8} />} />
      <NewTransferClient
        godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name, gstin: g.gstin, stateCode: g.stateCode }))}
        stock={grid.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, price: r.price, byGodown: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.saleable])) }))}
      />
    </div>
  );
}
