import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { Gift } from "lucide-react";
import { LoyaltySettingsClient } from "./LoyaltySettingsClient";

export default async function LoyaltySettingsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin
    .from("shops")
    .select("loyalty_points_per_100, loyalty_redemption_value")
    .eq("id", session.shopId)
    .single();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Loyalty program" subtitle="Reward regulars for coming back" icon={<Gift size={18} strokeWidth={1.8} />} />
      <LoyaltySettingsClient
        pointsPer100={Number(shop?.loyalty_points_per_100 ?? 0)}
        redemptionValue={Number(shop?.loyalty_redemption_value ?? 1)}
      />
    </div>
  );
}
