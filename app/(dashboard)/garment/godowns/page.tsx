import { Warehouse } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGarmentSettings, loadGodowns } from "@/lib/garment/data";
import { garmentGate } from "../gate";
import { GodownsClient } from "./GodownsClient";

export default async function GodownsPage() {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [godowns, settings] = await Promise.all([loadGodowns(admin, session.shopId), loadGarmentSettings(admin, session.shopId)]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Godowns")} subtitle={t("Every place stock is kept — the shop floor sells, the others store")} icon={<Warehouse size={18} strokeWidth={1.8} />} />
      <GodownsClient godowns={godowns} settings={settings} isOwner={session.role === "owner"} />
    </div>
  );
}
