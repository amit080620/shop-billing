import { Truck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { todayIso } from "@/lib/dateHelpers";
import { gapsReady } from "@/lib/gapsData";
import { NewChallanForm } from "./NewChallanForm";

export default async function NewChallanPage() {
  const { t, lang } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "delivery_challan")) return <ModuleBlocked moduleKey="delivery_challan" />;
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/challans" />
        <PageHeader title={t("New delivery challan")} icon={<Truck size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("This needs a one-time database update (migration 0052).")}</p>
      </div>
    );
  }
  const [{ data: customers }, { data: products }] = await Promise.all([
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("products").select("id, name, unit, stock_quantity, track_inventory").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/challans" />
      <PageHeader title={t("New delivery challan")} subtitle={t("Goods go now, the bill follows")} icon={<Truck size={18} strokeWidth={1.8} />} />
      <NewChallanForm
        lang={lang}
        today={todayIso()}
        customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "" }))}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name, unit: p.unit, stock: Number(p.stock_quantity), tracked: p.track_inventory }))}
      />
    </div>
  );
}
