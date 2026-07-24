import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RemindersClient } from "./RemindersClient";

export default async function RemindersPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: customers }, { data: bills }, { data: payments }] = await Promise.all([
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId),
    admin
      .from("bills")
      .select("customer_id, credit_amount, created_at")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .not("customer_id", "is", null)
      .order("created_at", { ascending: true }), // oldest first — needed for FIFO aging below
    admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId),
  ]);

  const paidByCustomer = new Map<string, number>();
  for (const p of payments ?? []) {
    paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
  }

  const billsByCustomer = new Map<string, { credit: number; createdAt: string }[]>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    const list = billsByCustomer.get(b.customer_id) ?? [];
    list.push({ credit: Number(b.credit_amount), createdAt: b.created_at });
    billsByCustomer.set(b.customer_id, list);
  }

  const now = Date.now();
  const withBalance = (customers ?? [])
    .map((c) => {
      const customerBills = billsByCustomer.get(c.id) ?? [];
      let remainingPayments = paidByCustomer.get(c.id) ?? 0;
      let balance = 0;
      let oldestPendingDate: string | null = null;

      // Apply payments against the oldest bills first (standard FIFO
      // settlement) — the age of the debt is how long the OLDEST bill that
      // still isn't fully covered has been sitting unpaid.
      for (const bill of customerBills) {
        const covered = Math.min(remainingPayments, bill.credit);
        remainingPayments -= covered;
        const pending = bill.credit - covered;
        if (pending > 0.01) {
          balance += pending;
          if (!oldestPendingDate) oldestPendingDate = bill.createdAt;
        }
      }

      const daysPending = oldestPendingDate
        ? Math.floor((now - new Date(oldestPendingDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance: Math.max(0, Math.round(balance * 100) / 100),
        daysPending,
      };
    })
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.daysPending - a.daysPending); // longest-overdue first

  const totalOutstanding = withBalance.reduce((s, c) => s + c.balance, 0);

  return (
    <RemindersClient
      shopName={session.shopName}
      customers={withBalance}
      totalOutstanding={totalOutstanding}
    />
  );
}
