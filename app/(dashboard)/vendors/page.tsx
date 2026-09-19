import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVendorBalances } from "@/lib/moneyBalances";
import { VendorsClient } from "./VendorsClient";

export default async function VendorsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: vendors }, balances] = await Promise.all([
    admin.from("vendors").select("id, name, phone, gstin").eq("shop_id", session.shopId).order("name"),
    getVendorBalances(admin, session.shopId),
  ]);

  const withBalance = (vendors ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    gstin: v.gstin,
    balance: Math.max(0, balances.get(v.id) ?? 0),
  }));

  return <VendorsClient initialVendors={withBalance} />;
}
