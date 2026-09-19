import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCreditEntries } from "@/lib/moneyBalances";
import { getTranslator } from "@/lib/i18n/server";
import { RemindersClient } from "./RemindersClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function RemindersPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "whatsapp_reminders")) return <ModuleBlocked moduleKey="whatsapp_reminders" />;
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: customers }, credits, { data: payments }] = await Promise.all([
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId),
    // Oldest first (needed for FIFO aging below); includes restaurant-order
    // and rental udhaar, not just bills.
    getCreditEntries(admin, session.shopId),
    admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId),
  ]);

  const paidByCustomer = new Map<string, number>();
  for (const p of payments ?? []) {
    paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
  }

  const billsByCustomer = new Map<string, { credit: number; createdAt: string }[]>();
  for (const c of credits) {
    const list = billsByCustomer.get(c.customerId) ?? [];
    list.push({ credit: c.credit, createdAt: c.createdAt });
    billsByCustomer.set(c.customerId, list);
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
      lang={lang}
      customers={withBalance}
      totalOutstanding={totalOutstanding}
    />
  );
}
