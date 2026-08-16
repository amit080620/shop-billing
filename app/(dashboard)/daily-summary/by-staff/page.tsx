import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Users } from "lucide-react";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default async function StaffCashSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam || todayIso();
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59.999`);

  const [{ data: staff }, { data: bills }, { data: paymentsReceived }, { data: purchases }, { data: vendorPayments }] =
    await Promise.all([
      admin.from("staff").select("id, name").eq("shop_id", session.shopId),
      admin
        .from("bills")
        .select("staff_id, paid_amount")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString()),
      admin
        .from("payments")
        .select("staff_id, amount")
        .eq("shop_id", session.shopId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString()),
      admin
        .from("purchases")
        .select("staff_id, paid_amount")
        .eq("shop_id", session.shopId)
        .eq("purchase_date", date),
      admin
        .from("purchase_payments")
        .select("staff_id, amount")
        .eq("shop_id", session.shopId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString()),
    ]);

  const nameById = new Map((staff ?? []).map((s) => [s.id, s.name]));

  type StaffTotals = { name: string; billCount: number; cashIn: number; cashOut: number };
  const byStaff = new Map<string, StaffTotals>();
  function bucket(staffId: string) {
    const existing = byStaff.get(staffId);
    if (existing) return existing;
    const fresh: StaffTotals = { name: nameById.get(staffId) ?? "Unknown", billCount: 0, cashIn: 0, cashOut: 0 };
    byStaff.set(staffId, fresh);
    return fresh;
  }

  for (const b of bills ?? []) {
    const s = bucket(b.staff_id);
    s.billCount += 1;
    s.cashIn = round2(s.cashIn + Number(b.paid_amount));
  }
  for (const p of paymentsReceived ?? []) {
    const s = bucket(p.staff_id);
    s.cashIn = round2(s.cashIn + Number(p.amount));
  }
  for (const p of purchases ?? []) {
    const s = bucket(p.staff_id);
    s.cashOut = round2(s.cashOut + Number(p.paid_amount));
  }
  for (const p of vendorPayments ?? []) {
    const s = bucket(p.staff_id);
    s.cashOut = round2(s.cashOut + Number(p.amount));
  }

  const rows = [...byStaff.values()].sort((a, b) => b.cashIn - a.cashIn);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Staff-wise cash"
        subtitle="Who handled how much — across every payment method combined."
        icon={<Users size={18} strokeWidth={1.8} />}
      />
      <Link href={`/daily-summary?date=${date}`} className="text-sm text-muted">
        ← Daily summary
      </Link>

      <form className="flex items-center gap-2" action="/daily-summary/by-staff">
        <input type="date" name="date" defaultValue={date} className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground">
          Go
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState text="No transactions recorded by any staff member on this date." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {rows.map((r) => {
            const net = round2(r.cashIn - r.cashOut);
            return (
              <li key={r.name} className="neu-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className={`text-lg font-bold ${net < 0 ? "text-danger" : "text-foreground"}`}>{formatMoney(net)}</p>
                </div>
                <p className="text-xs text-muted">{r.billCount} bill(s) created</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-brand-soft px-2.5 py-1.5">
                    <p className="text-brand-text/70">Handled in</p>
                    <p className="font-semibold text-brand-text">{formatMoney(r.cashIn)}</p>
                  </div>
                  <div className="rounded-lg bg-credit-soft px-2.5 py-1.5">
                    <p className="text-credit/70">Handled out</p>
                    <p className="font-semibold text-credit">{formatMoney(r.cashOut)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-lg border border-dashed border-border bg-surface px-3.5 py-3 text-xs text-muted">
        This adds up every payment method together (cash, card, UPI, etc.) — not just physical
        cash. It shows who processed each transaction, not necessarily who&apos;s physically holding
        the money right now, especially for card/UPI payments.
      </p>
    </div>
  );
}
