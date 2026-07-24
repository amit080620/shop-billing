import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CustomersClient } from "./CustomersClient";

export default async function CustomersPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: customers }, { data: bills }, { data: payments }] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, name, phone")
        .eq("shop_id", session.shopId)
        .order("name"),
      admin
        .from("bills")
        .select("customer_id, credit_amount")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
        .not("customer_id", "is", null),
      admin
        .from("payments")
        .select("customer_id, amount")
        .eq("shop_id", session.shopId),
    ]);

  const balances = new Map<string, number>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    balances.set(
      b.customer_id,
      (balances.get(b.customer_id) ?? 0) + Number(b.credit_amount),
    );
  }
  for (const p of payments ?? []) {
    balances.set(p.customer_id, (balances.get(p.customer_id) ?? 0) - Number(p.amount));
  }

  const withBalance = (customers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    balance: Math.max(0, balances.get(c.id) ?? 0),
  }));

  return <CustomersClient initialCustomers={withBalance} />;
}
