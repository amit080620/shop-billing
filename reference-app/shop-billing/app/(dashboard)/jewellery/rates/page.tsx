import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RatesClient } from "./RatesClient";

export default async function MetalRatesPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const today = new Date().toISOString().slice(0, 10);
  const { data: rates } = await admin
    .from("metal_rates")
    .select("metal_type, rate_per_gram")
    .eq("shop_id", session.shopId)
    .eq("effective_date", today);

  const { data: history } = await admin
    .from("metal_rates")
    .select("metal_type, rate_per_gram, effective_date")
    .eq("shop_id", session.shopId)
    .order("effective_date", { ascending: false })
    .limit(14);

  const gold = rates?.find((r) => r.metal_type === "gold");
  const silver = rates?.find((r) => r.metal_type === "silver");

  return (
    <RatesClient
      todayGold={gold ? Number(gold.rate_per_gram) : null}
      todaySilver={silver ? Number(silver.rate_per_gram) : null}
      history={(history ?? []).map((h) => ({
        metalType: h.metal_type,
        rate: Number(h.rate_per_gram),
        date: h.effective_date,
      }))}
    />
  );
}
