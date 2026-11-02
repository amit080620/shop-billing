import { Shirt } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { garmentGate } from "../../gate";
import { StyleForm } from "./StyleForm";

export default async function NewStylePage() {
  const gate = await garmentGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { data: categories } = await admin.from("categories").select("id, name").eq("shop_id", session.shopId).order("name");
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/styles" />
      <PageHeader title={t("New style")} subtitle={t("Name it once, tick its colours and sizes — every combination becomes an item")} icon={<Shirt size={18} strokeWidth={1.8} />} />
      <StyleForm categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
