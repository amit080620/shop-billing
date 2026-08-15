import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VendorsClient } from "./VendorsClient";

export default async function VendorsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: vendors }, { data: purchases }, { data: payments }] = await Promise.all([
    admin
      .from("vendors")
      .select("id, name, phone, gstin")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("purchases")
      .select("vendor_id, payable_amount")
      .eq("shop_id", session.shopId),
    admin
      .from("purchase_payments")
      .select("vendor_id, amount")
      .eq("shop_id", session.shopId),
  ]);

  const balances = new Map<string, number>();
  for (const p of purchases ?? []) {
    balances.set(p.vendor_id, (balances.get(p.vendor_id) ?? 0) + Number(p.payable_amount));
  }
  for (const p of payments ?? []) {
    balances.set(p.vendor_id, (balances.get(p.vendor_id) ?? 0) - Number(p.amount));
  }

  const withBalance = (vendors ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    gstin: v.gstin,
    balance: Math.max(0, balances.get(v.id) ?? 0),
  }));

  return <VendorsClient initialVendors={withBalance} />;
}
