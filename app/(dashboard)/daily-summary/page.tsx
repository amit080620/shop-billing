import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageIcon } from "@/app/components/PageIcon";
import { DatePicker } from "./DatePicker";

const METHODS = ["cash", "card", "upi", "online", "other"] as const;
type Method = (typeof METHODS)[number];

function emptyTotals(): Record<Method, number> {
  return { cash: 0, card: 0, upi: 0, online: 0, other: 0 };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam || todayIso();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59.999`);

  const [
    { data: bills },
    { data: paymentsReceived },
    { data: purchases },
    { data: vendorPayments },
  ] = await Promise.all([
    admin
      .from("bills")
      .select("payment_method, paid_amount, credit_amount")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    admin
      .from("payments")
      .select("payment_method, amount")
      .eq("shop_id", session.shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
    admin
      .from("purchases")
      .select("payment_method, paid_amount, payable_amount")
      .eq("shop_id", session.shopId)
      .eq("purchase_date", date),
    admin
      .from("purchase_payments")
      .select("payment_method, amount")
      .eq("shop_id", session.shopId)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
  ]);

  const salesByMethod = emptyTotals();
  let newCreditGiven = 0;
  for (const b of bills ?? []) {
    salesByMethod[b.payment_method as Method] += Number(b.paid_amount);
    newCreditGiven += Number(b.credit_amount);
  }

  const oldCreditCollected = emptyTotals();
  for (const p of paymentsReceived ?? []) {
    oldCreditCollected[p.payment_method as Method] += Number(p.amount);
  }

  const purchasesPaidByMethod = emptyTotals();
  let newPayableCreated = 0;
  for (const p of purchases ?? []) {
    purchasesPaidByMethod[p.payment_method as Method] += Number(p.paid_amount);
    newPayableCreated += Number(p.payable_amount);
  }

  const vendorPaymentsByMethod = emptyTotals();
  for (const p of vendorPayments ?? []) {
    vendorPaymentsByMethod[p.payment_method as Method] += Number(p.amount);
  }

  const totalIn = emptyTotals();
  const totalOut = emptyTotals();
  const net = emptyTotals();
  for (const m of METHODS) {
    totalIn[m] = round2(salesByMethod[m] + oldCreditCollected[m]);
    totalOut[m] = round2(purchasesPaidByMethod[m] + vendorPaymentsByMethod[m]);
    net[m] = round2(totalIn[m] - totalOut[m]);
  }

  const grandTotalIn = METHODS.reduce((s, m) => s + totalIn[m], 0);
  const grandTotalOut = METHODS.reduce((s, m) => s + totalOut[m], 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageIcon>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M3 10h18M8 14h.01M12 14h4" />
            </svg>
          </PageIcon>
          <h1 className="text-lg font-semibold text-foreground">Daily summary</h1>
        </div>
        <DatePicker date={date} />
      </div>
      <p className="text-xs text-muted">
        Use this at closing time to match your cash drawer — everything below is broken down by
        how it was paid.
      </p>

      <section className="rounded-xl p-4 shadow-md" style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}>
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">
          Expected cash in drawer (change today)
        </p>
        <p className="mt-1 text-2xl font-bold text-white">{formatMoney(net.cash)}</p>
        <p className="mt-1 text-xs text-white/70">
          Cash sales + cash udhaar collected − cash paid for purchases − cash paid to vendors
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-sm p-4">
        <h2 className="text-sm font-semibold text-foreground">💰 Money in — {formatMoney(grandTotalIn)}</h2>
        <BreakdownTable title="Sales collected today" byMethod={salesByMethod} />
        <BreakdownTable title="Old udhaar collected today" byMethod={oldCreditCollected} />
        {newCreditGiven > 0 && (
          <p className="text-xs text-credit">
            + {formatMoney(newCreditGiven)} sold on fresh credit today (not cash yet — tracked in Reminders)
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-sm p-4">
        <h2 className="text-sm font-semibold text-foreground">🧾 Money out — {formatMoney(grandTotalOut)}</h2>
        <BreakdownTable title="Purchases paid today" byMethod={purchasesPaidByMethod} />
        <BreakdownTable title="Vendor payments made today" byMethod={vendorPaymentsByMethod} />
        {newPayableCreated > 0 && (
          <p className="text-xs text-credit">
            + {formatMoney(newPayableCreated)} bought on credit from vendors today (not paid yet)
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Net by payment method</h2>
        <div className="flex flex-col gap-1.5 text-sm">
          {METHODS.map((m) => (
            <div key={m} className="flex justify-between">
              <span className="capitalize text-muted">{m}</span>
              <span className={`font-medium ${net[m] < 0 ? "text-danger" : "text-foreground"}`}>
                {formatMoney(net[m])}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BreakdownTable({ title, byMethod }: { title: string; byMethod: Record<Method, number> }) {
  const total = METHODS.reduce((s, m) => s + byMethod[m], 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-1 grid grid-cols-5 gap-1 text-center text-xs">
        {METHODS.map((m) => (
          <div key={m} className={byMethod[m] > 0 ? "" : "opacity-40"}>
            <p className="capitalize text-muted">{m}</p>
            <p className="font-semibold text-foreground">{formatMoney(byMethod[m])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
