import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PettyCashClient } from "./PettyCashClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function PettyCashPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "petty_cash")) return <ModuleBlocked moduleKey="petty_cash" />;
  const admin = createSupabaseAdminClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: entries } = await admin
    .from("petty_cash_entries")
    .select("id, description, amount, category, created_at")
    .eq("shop_id", session.shopId)
    .gte("created_at", startOfMonth.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <PettyCashClient
      entries={(entries ?? []).map((e) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        category: e.category,
        createdAt: e.created_at,
      }))}
    />
  );
}
