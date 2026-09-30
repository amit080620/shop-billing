import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { Users, Receipt, Calculator } from "lucide-react";
import { DatePicker } from "./DatePicker";
import { todayIso } from "@/lib/dateHelpers";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { computeDailyMoney, METHODS, type Method } from "@/lib/dailyMoney";
import { loadDayClose } from "@/lib/dayCloseData";
import { DayCloseCard } from "./DayCloseCard";

export default async function DailySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string }>;
}) {
  const { t } = await getTranslator();
  const { date: dateParam, branch: branchFilter } = await searchParams;
  const date = dateParam || todayIso();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: branches } = await admin.from("branches").select("id, name").eq("shop_id", session.shopId).order("name");

  const { salesByMethod, oldCreditCollected, debitNotesByMethod, advancesByMethod, refundsByMethod, purchasesPaidByMethod, vendorPaymentsByMethod, pettyCashByMethod, staffPaidByMethod, tripExpensesByMethod, depositsBackByMethod, advanceRefundsByMethod, net, grandTotalIn, grandTotalOut, newCreditGiven, newPayableCreated, invoiceMix } = await computeDailyMoney(admin, session.shopId, date, branchFilter);
  // Closing the day (migration 0044): the count saved for this day, and what to start from.
  const dayClose = await loadDayClose(admin, session.shopId, date, branchFilter || null);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("Daily summary")}
        icon={<Calculator size={18} strokeWidth={1.8} />}
        action={<DatePicker date={date} />}
      />
      {branches && branches.length > 0 && (
        <form className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          <input type="hidden" name="date" value={date} />
          <button
            type="submit"
            name="branch"
            value=""
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${!branchFilter ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
            style={!branchFilter ? { boxShadow: "var(--elev-xs)" } : undefined}
          >
            All branches
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              type="submit"
              name="branch"
              value={b.id}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${branchFilter === b.id ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
              style={branchFilter === b.id ? { boxShadow: "var(--elev-xs)" } : undefined}
            >
              {b.name}
            </button>
          ))}
        </form>
      )}
      <p className="text-xs text-muted">
        {t("Use this at closing time to match your cash drawer — everything below is broken down by how it was paid.")}
      </p>

      {session.role === "owner" && (
        <Link href={`/daily-summary/by-staff?date=${date}`} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-3 text-sm font-medium text-brand-text">
          <Users size={14} /> {t("Staff-wise breakdown →")}
        </Link>
      )}

      <section className="rounded-xl p-4 shadow-md" style={{ background: "var(--brand)" }}>
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">
          {t("Expected cash in drawer (change today)")}
        </p>
        <p className="mt-1 text-2xl font-bold text-white">{formatMoney(net.cash)}</p>
        <p className="mt-1 text-xs text-white/70">
          {t("Cash sales, udhaar and advances collected − cash paid for purchases, to vendors, petty and vehicle expenses, staff pay, refunds and deposits handed back")}
        </p>
      </section>

      {dayClose && (
        <DayCloseCard
          date={date}
          branchId={branchFilter || null}
          cashChange={net.cash}
          close={dayClose.close}
          suggestedOpening={dayClose.suggestedOpening}
          suggestedFrom={dayClose.suggestedFrom}
          recent={dayClose.recent}
          isOwner={session.role === "owner"}
        />
      )}

      <section className="neu-card flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
          <img src="/assets/ray-icons/payment.svg" alt="" className="h-3.5 w-3.5" /> {t("daily.moneyIn", { amount: formatMoney(grandTotalIn) })}
        </h2>
        <BreakdownTable title={t("Sales collected today")} byMethod={salesByMethod} t={t} />
        <BreakdownTable title={t("Old udhaar collected today")} byMethod={oldCreditCollected} t={t} />
        <BreakdownTable title={t("Debit notes collected today")} byMethod={debitNotesByMethod} t={t} />
        <BreakdownTable title={t("Advances taken today (repair jobs, bookings, schemes, prepaid)")} byMethod={advancesByMethod} t={t} />
        {newCreditGiven > 0 && (
          <p className="text-xs text-credit">
            + {formatMoney(newCreditGiven)} sold on fresh credit today (not cash yet — tracked in Reminders)
          </p>
        )}
      </section>

      {invoiceMix.b2b.count + invoiceMix.b2c.count > 0 && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t("Today's invoices: B2B and B2C")}</h2>
            <Link href="/reports/gstr1" className="text-xs font-medium text-brand-text">{t("GST reports →")}</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([["B2C", t("Customers without GSTIN"), invoiceMix.b2c], ["B2B", t("Made out to a GSTIN"), invoiceMix.b2b]] as const).map(([label, sub, mix]) => (
              <div key={label} className="rounded-lg bg-background p-3">
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted">{sub}</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatMoney(mix.value)}</p>
                <p className="text-[11px] text-muted">
                  {mix.count} {mix.count === 1 ? t("invoice") : t("invoices")} · GST {formatMoney(mix.gst)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="neu-card flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Receipt size={14} /> {t("daily.moneyOut", { amount: formatMoney(grandTotalOut) })}</h2>
        <BreakdownTable title={t("Purchases paid today")} byMethod={purchasesPaidByMethod} t={t} />
        <BreakdownTable title={t("Vendor payments made today")} byMethod={vendorPaymentsByMethod} t={t} />
        <BreakdownTable title={t("Refunds given for returns today")} byMethod={refundsByMethod} t={t} />
        <BreakdownTable title={t("Petty cash and expenses today")} byMethod={pettyCashByMethod} t={t} />
        <BreakdownTable title={t("Staff salary and advances paid today")} byMethod={staffPaidByMethod} t={t} />
        {Object.values(tripExpensesByMethod).some((v) => v > 0) && <BreakdownTable title={t("Vehicle expenses today (diesel, toll, driver…)")} byMethod={tripExpensesByMethod} t={t} />}
        <BreakdownTable title={t("Rental deposits handed back today")} byMethod={depositsBackByMethod} t={t} />
        <BreakdownTable title={t("Advances handed back today (tokens, cancelled bookings, schemes, prepaid)")} byMethod={advanceRefundsByMethod} t={t} />
        {newPayableCreated > 0 && (
          <p className="text-xs text-credit">
            + {formatMoney(newPayableCreated)} bought on credit from vendors today (not paid yet)
          </p>
        )}
      </section>

      <section className="neu-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">{t("Net by payment method")}</h2>
        <div className="flex flex-col gap-1.5 text-sm">
          {METHODS.map((m) => (
            <div key={m} className="flex justify-between">
              <span className="text-muted">{t(paymentMethodLabel(m))}</span>
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

function BreakdownTable({ title, byMethod, t }: { title: string; byMethod: Record<Method, number>; t: (key: string) => string }) {
  const total = METHODS.reduce((s, m) => s + byMethod[m], 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-1 grid grid-cols-5 gap-1 text-center text-xs">
        {METHODS.map((m) => (
          <div key={m} className={byMethod[m] > 0 ? "" : "opacity-40"}>
            <p className="text-muted">{t(paymentMethodLabel(m))}</p>
            <p className="font-semibold text-foreground">{formatMoney(byMethod[m])}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

