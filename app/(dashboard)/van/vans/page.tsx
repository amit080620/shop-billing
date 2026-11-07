import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadPlaces, loadStaff } from "@/lib/van/data";
import { vanMoreReady } from "@/lib/van/server";
import { vanGate } from "../gate";
import { VansClient } from "./VansClient";

export default async function VansPage() {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [{ vans, main }, staff, more] = await Promise.all([loadPlaces(admin, session.shopId), loadStaff(admin, session.shopId).then((list) => list.filter((s) => !s.removed)), vanMoreReady(admin)]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Vans")} subtitle={t("Each van keeps its own stock while it is out")} icon={<Truck size={18} strokeWidth={1.8} />} />
      <p className="text-xs text-muted">{main ? t("Loads come from {godown}, where the counter sells and purchases land.", { godown: main.name }) : t("Adding the first van also sets up your main godown, where all your stock is now.")}</p>
      <VansClient vans={vans} staff={staff} more={more} />
    </div>
  );
}
