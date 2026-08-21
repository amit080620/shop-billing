import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { Zap } from "lucide-react";
import { FastBillingSettingsClient } from "./FastBillingSettingsClient";

export default async function FastBillingSettingsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin.from("shops").select("fast_billing_enabled").eq("id", session.shopId).single();

  const { count: fastBillingProductCount } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", session.shopId)
    .eq("show_in_fast_billing", true);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Fast billing" subtitle="A quick tap-to-add counter for busy hours" icon={<Zap size={18} strokeWidth={1.8} />} />
      <FastBillingSettingsClient enabled={shop?.fast_billing_enabled ?? false} productCount={fastBillingProductCount ?? 0} />
    </div>
  );
}
