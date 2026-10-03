import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { DateRangeControls } from "@/app/components/DateRangeControls";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Receipt, Search } from "lucide-react";
import Link from "@/lib/link";
import { todayIso } from "@/lib/dateHelpers";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { PartyTypeChips, parsePartyType } from "@/app/components/PartyTypeChips";

export default async function AllBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; customer?: string; type?: string }>;
}) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const { from: fromParam, to: toParam, customer: customerFilter, type: typeParam } = await searchParams;
  const today = todayIso();
  const from = fromParam || today;
  const to = toParam || today;
  const partyType = parsePartyType(typeParam);

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("bills")
    .select("id, invoice_number, total, credit_amount, status, created_at, buyer_name, buyer_gstin, customers ( name )")
    .eq("shop_id", session.shopId)
    .gte("created_at", `${from}T00:00:00+05:30`)
    .lte("created_at", `${to}T23:59:59.999+05:30`);
  // Every bill carries the buyer it was made out to, so B2B is simply "has a buyer GSTIN".
  if (partyType === "b2b") query = query.not("buyer_gstin", "is", null);
  if (partyType === "b2c") query = query.is("buyer_gstin", null);
  const { data: bills } = await query.order("created_at", { ascending: false }).limit(200);

  const rows = (bills ?? []).map((b) => ({ ...b, customerName: (Array.isArray(b.customers) ? b.customers[0] : b.customers)?.name ?? null }));
  const filtered = customerFilter
    ? rows.filter((b) => b.customerName?.toLowerCase().includes(customerFilter.toLowerCase()))
    : rows;
  const active = filtered.filter((b) => b.status !== "voided");
  const total = active.reduce((s, b) => s + Number(b.total), 0);
  const due = active.reduce((s, b) => s + Number(b.credit_amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader icon={<Receipt size={20} />} title={t("bills.title")} subtitle={t("bills.subtitle")} />

      <DateRangeControls from={from} to={to} basePath="/bills/all" />

      <form className="flex items-center gap-2">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        {partyType !== "all" && <input type="hidden" name="type" value={partyType} />}
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="customer"
            defaultValue={customerFilter ?? ""}
            placeholder={t("bills.searchCustomer")}
            className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
          />
        </label>
        <button type="submit" className="btn-primary-sm shrink-0">
          {t("common.search")}
        </button>
      </form>

      <PartyTypeChips
        basePath="/bills/all"
        params={{ from, to, customer: customerFilter }}
        current={partyType}
        labels={{ all: t("All bills"), b2b: t("B2B (GSTIN)"), b2c: t("B2C") }}
      />

      {active.length > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center">
          <div>
            <p className="text-[11px] text-muted">{t("bills.count")}</p>
            <p className="text-sm font-semibold text-foreground">{active.length}</p>
          </div>
          <div className="border-x border-border">
            <p className="text-[11px] text-muted">{t("bills.total")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t("bills.onUdhaar")}</p>
            <p className={`text-sm font-semibold ${due > 0 ? "text-credit" : "text-foreground"}`}>{formatMoney(due)}</p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("bills.emptyTitle")}
          text={t("bills.emptyText")}
          action={
            <Link href="/bills/new" className="btn-primary-sm">
              {t("common.newBillPlus")}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((b) => {
            const voided = b.status === "voided";
            const credit = Number(b.credit_amount);
            return (
              <li key={b.id}>
                <Link href={`/print/bill/${b.id}`} className={`neu-card flex items-center justify-between gap-3 px-3.5 py-3 ${voided ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{b.customerName ?? b.buyer_name ?? t("common.walkinCustomer")}</p>
                    <p className="truncate text-xs text-muted">
                      {b.buyer_gstin && (
                        <span className="mr-1 rounded bg-brand-soft px-1 py-px text-[10px] font-semibold text-brand-text">B2B</span>
                      )}
                      {b.invoice_number} · {formatDateTime(b.created_at)}
                    </p>
                    {b.buyer_gstin && b.buyer_name && b.buyer_name !== b.customerName && (
                      <p className="truncate text-[11px] text-muted">{t("Bill to")}: {b.buyer_name}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold text-foreground ${voided ? "line-through" : ""}`}>{formatMoney(b.total)}</p>
                    {voided ? (
                      <span className="text-[11px] font-medium text-danger">{t("common.voided")}</span>
                    ) : credit > 0 ? (
                      <span className="text-[11px] font-medium text-credit">{t("common.due", { amount: formatMoney(credit) })}</span>
                    ) : (
                      <span className="text-[11px] font-medium text-success">{t("common.paid")}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
