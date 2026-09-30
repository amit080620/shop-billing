import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney } from "@/lib/format";
import { formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { dueDateFor, wholesaleReady } from "@/lib/wholesaleData";
import { partyDues, pendingBills, type DueBill } from "@/lib/dues";

/** Who owes what and since when — bill by bill against each party's credit days, beat by beat for the collection round. */
export default async function DuesPage({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await wholesaleReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/reports" />
        <PageHeader title={t("Payments due")} icon={<CalendarClock size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("This needs a one-time database update (migration 0053).")}</p>
      </div>
    );
  }
  const { beat } = await searchParams;
  const today = todayIso();
  const [{ data: bills }, { data: payments }, { data: parties }] = await Promise.all([
    admin.from("bills").select("id, invoice_number, created_at, due_date, credit_amount, customer_id").eq("shop_id", session.shopId).eq("status", "active").gt("credit_amount", 0).not("customer_id", "is", null).order("created_at").limit(20000),
    admin.from("payments").select("customer_id, amount").eq("shop_id", session.shopId).limit(50000),
    admin.from("customers").select("id, name, phone, beat, credit_days").eq("shop_id", session.shopId),
  ]);
  const party = new Map((parties ?? []).map((p) => [p.id, p]));
  const paid = new Map<string, number>();
  for (const p of payments ?? []) paid.set(p.customer_id, (paid.get(p.customer_id) ?? 0) + Number(p.amount));
  const byParty = new Map<string, DueBill[]>();
  for (const b of bills ?? []) {
    const date = new Date(b.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const due = b.due_date ?? dueDateFor(date, party.get(b.customer_id!)?.credit_days ?? null) ?? date;
    byParty.set(b.customer_id!, [...(byParty.get(b.customer_id!) ?? []), { id: b.id, number: b.invoice_number, date, due, credit: Number(b.credit_amount) }]);
  }
  const rows = [...byParty]
    .map(([id, list]) => {
      const p = party.get(id);
      const pending = pendingBills(list, paid.get(id) ?? 0, today);
      return { id, name: p?.name ?? "—", phone: p?.phone ?? null, beat: p?.beat ?? null, pending, ...partyDues(pending) };
    })
    .filter((r) => r.owed > 0 && (!beat || r.beat === beat))
    .sort((a, b) => b.maxOverdueDays - a.maxOverdueDays || b.owed - a.owed);
  const beats = [...new Set((parties ?? []).map((p) => p.beat).filter((b): b is string => !!b))].sort();
  const total = rows.reduce((s, r) => s + r.owed, 0);
  const overdue = rows.reduce((s, r) => s + r.overdue, 0);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/reports" />
      <PageHeader title={t("Payments due")} subtitle={t("Bill by bill against each party's credit days — oldest dues first")} icon={<CalendarClock size={18} strokeWidth={1.8} />} />
      <div className="grid grid-cols-2 gap-2">
        <div className="neu-card p-3">
          <p className="text-xs text-muted">{t("To collect")}</p>
          <p className="text-lg font-semibold text-foreground">{formatMoney(total)}</p>
        </div>
        <div className="neu-card p-3">
          <p className="text-xs text-danger">{t("Overdue")}</p>
          <p className="text-lg font-semibold text-danger">{formatMoney(overdue)}</p>
        </div>
      </div>
      {beats.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto scroll-hide px-4">
          <Link href="/reports/dues" className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!beat ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {t("All beats")}
          </Link>
          {beats.map((b) => (
            <Link key={b} href={`/reports/dues?beat=${encodeURIComponent(b)}`} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${beat === b ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {b}
            </Link>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState text={t("Nobody owes anything right now.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const text = [
              t("Namaste {name}, a reminder from {shop}. Bills due:", { name: r.name, shop: session.shopName }),
              ...r.pending.map((b) => `• ${b.number} (${formatIsoDate(b.date)}) — ${formatMoney(b.pending)}${b.overdueDays > 0 ? ` — ${t("{n} days overdue", { n: b.overdueDays })}` : ` — ${t("due {date}", { date: formatIsoDate(b.due) })}`}`),
              t("Total: {amount}", { amount: formatMoney(r.owed) }),
            ].join("\n");
            return (
              <li key={r.id} className="neu-card flex flex-col gap-1.5 px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/customers/${r.id}`} className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted">
                      {r.pending.length} {t("bill(s)")}
                      {r.beat ? ` · ${r.beat}` : ""}
                    </p>
                  </Link>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatMoney(r.owed)}</p>
                    {r.overdue > 0 ? (
                      <p className="text-[11px] font-medium text-danger">{t("{amount} overdue · {n} days", { amount: formatMoney(r.overdue), n: r.maxOverdueDays })}</p>
                    ) : (
                      <p className="text-[11px] text-success">{t("Not due yet")}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.pending.slice(0, 6).map((b) => (
                    <span key={b.id} className={`rounded-full px-2 py-0.5 text-[10px] ${b.overdueDays > 30 ? "bg-danger-soft text-danger" : b.overdueDays > 0 ? "bg-credit-soft text-credit" : "bg-surface-2 text-muted"}`}>
                      {b.number.split("/").pop()} · {formatMoney(b.pending)}
                      {b.overdueDays > 0 ? ` · ${b.overdueDays}d` : ""}
                    </span>
                  ))}
                </div>
                {r.phone && (
                  <a href={buildWhatsAppLink(r.phone, text)} target="_blank" rel="noopener noreferrer" className="self-start rounded-full bg-[#25D366] px-3 py-1 text-xs font-medium text-white">
                    {t("Remind on WhatsApp")}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
