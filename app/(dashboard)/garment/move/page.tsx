import { ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { garmentGate } from "../gate";
import { MoveClient } from "./MoveClient";

export default async function MovePage() {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [godowns, grid] = await Promise.all([loadGodowns(admin, session.shopId), loadStockGrid(admin, session.shopId)]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Move on the spot")} subtitle={t("Within the same premises — shop floor ↔ godown, putting a purchase away. For another place, use a transfer.")} icon={<ArrowLeftRight size={18} strokeWidth={1.8} />} />
      <MoveClient
        godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name, isDefault: g.isDefault }))}
        stock={grid.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, byGodown: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.saleable])) }))}
      />
    </div>
  );
}
