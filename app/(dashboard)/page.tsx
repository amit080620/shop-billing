import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";

export default async function DashboardPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [todayBills, weekBills, allBillsCredit, allPayments, recentBills, monthOutputGst, monthInputGst, allPayables, allVendorPayments] =
    await Promise.all([
      admin
        .from("bills")
        .select("total")
        .eq("shop_id", session.shopId)
        .gte("created_at", startOfToday.toISOString()),
      admin
        .from("bills")
        .select("total")
        .eq("shop_id", session.shopId)
        .gte("created_at", startOfWeek.toISOString()),
      admin.from("bills").select("credit_amount").eq("shop_id", session.shopId),
      admin.from("payments").select("amount").eq("shop_id", session.shopId),
      admin
        .from("bills")
        .select("id, total, credit_amount, created_at, customers ( name )")
        .eq("shop_id", session.shopId)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("bills")
        .select("cgst_amount, sgst_amount, igst_amount")
        .eq("shop_id", session.shopId)
        .gte("created_at", startOfMonth.toISOString()),
      admin
        .from("purchases")
        .select("cgst_amount, sgst_amount, igst_amount")
        .eq("shop_id", session.shopId)
        .eq("itc_eligible", true)
        .gte("purchase_date", startOfMonth.toISOString().slice(0, 10)),
      admin.from("purchases").select("payable_amount").eq("shop_id", session.shopId),
      admin.from("purchase_payments").select("amount").eq("shop_id", session.shopId),
    ]);

  const todayTotal = sum(todayBills.data?.map((b) => b.total));
  const weekTotal = sum(weekBills.data?.map((b) => b.total));
  const totalCredit = sum(allBillsCredit.data?.map((b) => b.credit_amount));
  const totalPaidBack = sum(allPayments.data?.map((p) => p.amount));
  const outstanding = Math.max(0, totalCredit - totalPaidBack);

  const outputGst = (monthOutputGst.data ?? []).reduce(
    (s, b) => s + Number(b.cgst_amount) + Number(b.sgst_amount) + Number(b.igst_amount),
    0,
  );
  const inputGst = (monthInputGst.data ?? []).reduce(
    (s, p) => s + Number(p.cgst_amount) + Number(p.sgst_amount) + Number(p.igst_amount),
    0,
  );
  const netGst = Math.max(0, outputGst - inputGst);

  const totalPayable = sum(allPayables.data?.map((p) => p.payable_amount));
  const totalVendorPaid = sum(allVendorPayments.data?.map((p) => p.amount));
  const outstandingPayable = Math.max(0, totalPayable - totalVendorPaid);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Today's sales" value={formatMoney(todayTotal)} />
        <StatCard label="Last 7 days" value={formatMoney(weekTotal)} />
        <StatCard
          label="Outstanding credit"
          value={formatMoney(outstanding)}
          tone="credit"
          href="/reminders"
        />
        <StatCard
          label="Payable to vendors"
          value={formatMoney(outstandingPayable)}
          tone="credit"
        />
      </section>

      <Link
        href="/reports/gstr3b"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          This month&apos;s GST — both sides
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted">Output (sales)</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(outputGst)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Input (purchases)</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(inputGst)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Net payable (est.)</p>
            <p className="text-sm font-semibold text-brand">{formatMoney(netGst)}</p>
          </div>
        </div>
      </Link>

      <Link
        href="/bills/new"
        className="flex items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-center font-medium text-white active:bg-brand-dark"
      >
        + New bill
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Recent bills
        </h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState text="No bills yet. Create your first bill to see it here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.data.map((bill) => {
              const customerName = Array.isArray(bill.customers)
                ? bill.customers[0]?.name
                : (bill.customers as { name: string } | null)?.name;
              return (
                <li key={bill.id}>
                  <Link
                    href={`/print/bill/${bill.id}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {customerName ?? "Walk-in customer"}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDateTime(bill.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatMoney(bill.total)}
                      </p>
                      {bill.credit_amount > 0 && (
                        <p className="text-xs text-credit">
                          {formatMoney(bill.credit_amount)} credit
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  className = "",
  href,
}: {
  label: string;
  value: string;
  tone?: "default" | "credit";
  className?: string;
  href?: string;
}) {
  const cardClassName = `rounded-xl border border-border p-4 ${
    tone === "credit" ? "bg-credit-soft" : "bg-surface"
  } ${className}`;
  const content = (
    <>
      <p className={`text-xs ${tone === "credit" ? "text-credit" : "text-muted"}`}>
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${
          tone === "credit" ? "text-credit" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

function sum(values: number[] | undefined) {
  return (values ?? []).reduce((a, b) => a + Number(b), 0);
}
