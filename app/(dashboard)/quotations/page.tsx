import Link from "@/lib/link";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { BackLink } from "@/app/components/BackLink";
import { quotationsReady } from "@/lib/quotationsData";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { wholesaleReady } from "@/lib/wholesaleData";

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "quotations")) return <ModuleBlocked moduleKey="quotations" />;
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const { status: statusParam } = await searchParams;
  const status = statusParam === "converted" || statusParam === "cancelled" || statusParam === "all" ? statusParam : "open";

  if (!(await quotationsReady(admin))) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink fallback="/more" />
        <PageHeader title={t("Quotations")} icon={<FileText size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Quotations need a one-time database update (migration 0045).")}</p>
      </div>
    );
  }

  let query = admin
    .from("quotations")
    .select("id, quote_number, customer_name, total, status, valid_until, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  // Salesmen's orders have their own screen (Orders).
  if (await wholesaleReady(admin)) query = query.eq("kind", "quote");
  const { data: quotes } = await query;
  const today = todayIso();

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/more" />
      <PageHeader
        title={t("Quotations")}
        subtitle={t("Price offers — turn one into a bill when the customer agrees")}
        icon={<FileText size={18} strokeWidth={1.8} />}
        action={
          <Link href="/bills/new" className="btn-primary-sm">
            {t("+ New")}
          </Link>
        }
      />
      <p className="text-xs text-muted">{t("Make a quotation from New Bill: add the items, then \"Save as quotation\" at the end.")}</p>

      <div role="group" className="flex gap-2 overflow-x-auto scroll-hide">
        {(["open", "converted", "cancelled", "all"] as const).map((s) => (
          <Link
            key={s}
            href={s === "open" ? "/quotations" : `/quotations?status=${s}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${status === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {s === "open" ? t("Open") : s === "converted" ? t("Billed") : s === "cancelled" ? t("Cancelled") : t("All")}
          </Link>
        ))}
      </div>

      {!quotes?.length ? (
        <EmptyState icon={FileText} title={t("No quotations here")} text={t("A quotation is the cart of a New Bill, saved with a price and a validity date.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => {
            const expired = q.status === "open" && q.valid_until && q.valid_until < today;
            return (
              <li key={q.id}>
                <Link href={`/print/quotation/${q.id}`} className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{q.customer_name ?? t("common.walkinCustomer")}</p>
                    <p className="truncate text-xs text-muted">
                      {q.quote_number} · {formatDateTime(q.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatMoney(q.total)}</p>
                    <span className={`text-[11px] font-medium ${q.status === "converted" ? "text-success" : q.status === "cancelled" || expired ? "text-danger" : "text-brand-text"}`}>
                      {q.status === "converted" ? t("Billed") : q.status === "cancelled" ? t("Cancelled") : expired ? t("Expired") : q.valid_until ? t("Valid till {date}", { date: formatIsoDate(q.valid_until) }) : t("Open")}
                    </span>
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
