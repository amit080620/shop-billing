import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { Users, Wallet, Receipt, Calculator } from "lucide-react";
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
  searchParams: Promise<{ date?: string; branch?: string }>;
}) {
  const { date: dateParam, branch: branchFilter } = await searchParams;
  const date = dateParam || todayIso();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: branches } = await admin.from("branches").select("id, name").eq("shop_id", session.shopId).order("name");

  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59.999`);

  let billsQuery = admin
    .from("bills")
    .select("payment_method, paid_amount, credit_amount")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString());
  if (branchFilter) billsQuery = billsQuery.eq("branch_id", branchFilter);

  const [
    { data: bills },
    { data: paymentsReceived },
    { data: purchases },
    { data: vendorPayments },
    { data: restaurantOrders },
    { data: rentals },
  ] = await Promise.all([
    billsQuery,
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
    // Restaurant sales live in a separate table (Tables/Orders/Settle),
    // never in `bills` — without this, a restaurant's takings would be
    // completely invisible here even though real money changed hands.
    admin
      .from("restaurant_orders")
      .select("id, credit_amount, restaurant_order_payments ( payment_method, amount )")
      .eq("shop_id", session.shopId)
      .eq("status", "settled")
      .gte("settled_at", startOfDay.toISOString())
      .lte("settled_at", endOfDay.toISOString()),
    // Rentals also never touch `bills` — same reasoning as restaurant
    // orders above.
    admin
      .from("rentals")
      .select("payment_method, paid_amount, credit_amount")
      .eq("shop_id", session.shopId)
      .neq("status", "cancelled")
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString()),
  ]);

  const salesByMethod = emptyTotals();
  let newCreditGiven = 0;
  for (const b of bills ?? []) {
    salesByMethod[b.payment_method as Method] += Number(b.paid_amount);
    newCreditGiven += Number(b.credit_amount);
  }
  for (const order of restaurantOrders ?? []) {
    const orderPayments = Array.isArray(order.restaurant_order_payments) ? order.restaurant_order_payments : [];
    for (const p of orderPayments) {
      const method = p.payment_method === "card" || p.payment_method === "cash" || p.payment_method === "upi" || p.payment_method === "online" ? p.payment_method : "other";
      salesByMethod[method as Method] += Number(p.amount);
    }
    newCreditGiven += Number(order.credit_amount);
  }
  for (const r of rentals ?? []) {
    salesByMethod[r.payment_method as Method] += Number(r.paid_amount);
    newCreditGiven += Number(r.credit_amount);
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
      <PageHeader
        title="Daily summary"
        icon={<Calculator size={18} strokeWidth={1.8} />}
        action={<DatePicker date={date} />}
      />
      {branches && branches.length > 0 && (
        <form className="flex gap-2 overflow-x-auto pb-1">
          <input type="hidden" name="date" value={date} />
          <button
            type="submit"
            name="branch"
            value=""
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${!branchFilter ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}
          >
            All branches
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              type="submit"
              name="branch"
              value={b.id}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${branchFilter === b.id ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}
            >
              {b.name}
            </button>
          ))}
        </form>
      )}
      <p className="text-xs text-muted">
        Use this at closing time to match your cash drawer — everything below is broken down by
        how it was paid.
      </p>

      {session.role === "owner" && (
        <Link href={`/daily-summary/by-staff?date=${date}`} className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand bg-brand-soft px-3.5 py-3 text-sm font-medium text-brand-dark">
          <Users size={14} /> Staff-wise breakdown →
        </Link>
      )}

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
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Wallet size={14} /> Money in — {formatMoney(grandTotalIn)}</h2>
        <BreakdownTable title="Sales collected today" byMethod={salesByMethod} />
        <BreakdownTable title="Old udhaar collected today" byMethod={oldCreditCollected} />
        {newCreditGiven > 0 && (
          <p className="text-xs text-credit">
            + {formatMoney(newCreditGiven)} sold on fresh credit today (not cash yet — tracked in Reminders)
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface shadow-sm p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Receipt size={14} /> Money out — {formatMoney(grandTotalOut)}</h2>
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
