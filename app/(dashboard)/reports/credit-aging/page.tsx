import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AlertTriangle } from "lucide-react";
import { AgingRow } from "./AgingRow";

export default async function CreditAgingPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: bills }, { data: payments }, { data: customers }] = await Promise.all([
    admin
      .from("bills")
      .select("customer_id, credit_amount, created_at")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gt("credit_amount", 0)
      .not("customer_id", "is", null)
      .order("created_at", { ascending: true }),
    admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId),
  ]);

  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const paidByCustomer = new Map<string, number>();
  for (const p of payments ?? []) {
    if (!p.customer_id) continue;
    paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
  }

  // Payments aren't tied to a specific bill, only a customer's overall
  // balance — so "oldest unpaid bill" is approximated as the oldest
  // credit-bearing bill whose cumulative credit (up to and including it)
  // still exceeds what they've paid back in total. This is a genuine
  // best-effort ordering, not a precise which-bill-is-paid allocation,
  // since the app doesn't track payment-to-bill matching at that level.
  type Entry = { customerId: string; totalDue: number; oldestBillDate: string };
  const runningCredit = new Map<string, number>();
  const oldestUnpaidDate = new Map<string, string>();

  for (const bill of bills ?? []) {
    if (!bill.customer_id) continue;
    const already = runningCredit.get(bill.customer_id) ?? 0;
    const paid = paidByCustomer.get(bill.customer_id) ?? 0;
    if (already < paid) {
      // This bill's credit is covered by payments made so far.
      runningCredit.set(bill.customer_id, already + Number(bill.credit_amount));
      continue;
    }
    if (!oldestUnpaidDate.has(bill.customer_id)) {
      oldestUnpaidDate.set(bill.customer_id, bill.created_at);
    }
    runningCredit.set(bill.customer_id, already + Number(bill.credit_amount));
  }

  const entries: Entry[] = [];
  for (const [customerId, totalCredit] of runningCredit.entries()) {
    const totalDue = Math.max(0, totalCredit - (paidByCustomer.get(customerId) ?? 0));
    if (totalDue <= 0) continue;
    entries.push({
      customerId,
      totalDue,
      oldestBillDate: oldestUnpaidDate.get(customerId) ?? new Date().toISOString(),
    });
  }

  const today = new Date();
  function daysAgo(dateStr: string) {
    return Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86400000);
  }

  const buckets = {
    fresh: entries.filter((e) => daysAgo(e.oldestBillDate) <= 30),
    aging: entries.filter((e) => daysAgo(e.oldestBillDate) > 30 && daysAgo(e.oldestBillDate) <= 60),
    old: entries.filter((e) => daysAgo(e.oldestBillDate) > 60 && daysAgo(e.oldestBillDate) <= 90),
    veryOld: entries.filter((e) => daysAgo(e.oldestBillDate) > 90),
  };

  const totalOutstanding = entries.reduce((s, e) => s + e.totalDue, 0);

  const sections = [
    { key: "veryOld", label: "90+ days — chase these first", entries: buckets.veryOld, tone: "danger" as const },
    { key: "old", label: "61–90 days", entries: buckets.old, tone: "warning" as const },
    { key: "aging", label: "31–60 days", entries: buckets.aging, tone: "warning" as const },
    { key: "fresh", label: "0–30 days — still fresh", entries: buckets.fresh, tone: "default" as const },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Udhaar aging"
        subtitle="Who's owed the longest — chase the oldest first"
        icon={<AlertTriangle size={18} strokeWidth={1.8} />}
      />

      <div className="neu-card p-4 text-center">
        <p className="text-xs text-muted">Total outstanding</p>
        <p className="mt-1 text-3xl font-bold text-credit neu-text">{formatMoney(totalOutstanding)}</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState text="No outstanding udhaar right now." />
      ) : (
        sections.map(
          (section) =>
            section.entries.length > 0 && (
              <section key={section.key} className="flex flex-col gap-2">
                <h2
                  className={`px-1 text-xs font-semibold uppercase tracking-wide ${
                    section.tone === "danger" ? "text-danger" : section.tone === "warning" ? "text-warning" : "text-muted"
                  }`}
                >
                  {section.label} · {section.entries.length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {section.entries
                    .sort((a, b) => b.totalDue - a.totalDue)
                    .map((e) => {
                      const customer = customerById.get(e.customerId);
                      if (!customer) return null;
                      return (
                        <AgingRow
                          key={e.customerId}
                          customerId={e.customerId}
                          name={customer.name}
                          phone={customer.phone}
                          amount={e.totalDue}
                          days={daysAgo(e.oldestBillDate)}
                        />
                      );
                    })}
                </ul>
              </section>
            ),
        )
      )}
    </div>
  );
}
