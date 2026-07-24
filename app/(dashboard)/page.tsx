import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { getTranslator } from "@/lib/i18n/server";

export default async function DashboardPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
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
        .eq("status", "active")
        .gte("created_at", startOfToday.toISOString()),
      admin
        .from("bills")
        .select("total")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
        .gte("created_at", startOfWeek.toISOString()),
      admin.from("bills").select("credit_amount").eq("shop_id", session.shopId).eq("status", "active"),
      admin.from("payments").select("amount").eq("shop_id", session.shopId),
      admin
        .from("bills")
        .select("id, total, credit_amount, created_at, customers ( name )")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("bills")
        .select("cgst_amount, sgst_amount, igst_amount")
        .eq("shop_id", session.shopId)
        .eq("status", "active")
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
      <div>
        <p className="text-lg font-semibold text-foreground">{t(greetingKey())}, {session.staffName.split(" ")[0]}</p>
        <p className="text-sm text-muted">{t("home.subtitle", { shop: session.shopName })}</p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <StatCard label={t("home.todaySales")} value={formatMoney(todayTotal)} />
        <StatCard label={t("home.last7Days")} value={formatMoney(weekTotal)} />
        <StatCard
          label={t("home.outstandingCredit")}
          value={formatMoney(outstanding)}
          tone="credit"
          href="/reminders"
        />
        <StatCard
          label={t("home.payableToVendors")}
          value={formatMoney(outstandingPayable)}
          tone="credit"
        />
      </section>

      <Link
        href="/reports/gstr3b"
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("home.gstBothSides")}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted">{t("home.outputSales")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(outputGst)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("home.inputPurchases")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(inputGst)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{t("home.netPayableEst")}</p>
            <p className="text-sm font-semibold text-brand">{formatMoney(netGst)}</p>
          </div>
        </div>
      </Link>

      <Link
        href="/bills/new"
        className="flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center font-semibold text-white shadow-md"
        style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
      >
        <PlusIcon />
        {t("home.newBill")}
      </Link>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          {t("home.recentBills")}
        </h2>
        {!recentBills.data || recentBills.data.length === 0 ? (
          <EmptyState text={t("home.noBillsYet")} />
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
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {customerName ?? t("common.walkinCustomer")}
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
                          {formatMoney(bill.credit_amount)} {t("home.credit")}
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

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "home.greeting.morning";
  if (hour < 17) return "home.greeting.afternoon";
  return "home.greeting.evening";
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
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
  const cardClassName = `rounded-xl border border-border p-4 shadow-sm ${
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
