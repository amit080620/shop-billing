import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { goldSchemesReady, loadSchemes } from "@/lib/goldSchemeData";
import { NewSchemeForm } from "./NewSchemeForm";

export default async function GoldSchemesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const { status: statusParam } = await searchParams;
  const status = statusParam === "redeemed" || statusParam === "closed" ? statusParam : "active";

  if (!(await goldSchemesReady(admin))) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink fallback="/jewellery" />
        <PageHeader title={t("Gold saving schemes")} icon={<PiggyBank size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Gold schemes need a one-time database update (migration 0047).")}</p>
      </div>
    );
  }

  const [views, { data: customers }] = await Promise.all([
    loadSchemes(admin, session.shopId, { status }),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name").limit(2000),
  ]);
  const running = status === "active" ? views : [];
  const collected = running.reduce((s, v) => s + v.figures.paid, 0);
  const overdue = running.filter((v) => v.figures.overdue).length;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/jewellery" />
      <PageHeader title={t("Gold saving schemes")} subtitle={t("Monthly instalments, a bonus at the end, jewellery at maturity")} icon={<PiggyBank size={18} strokeWidth={1.8} />} />

      <NewSchemeForm customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))} />

      <div role="group" className="flex gap-2">
        {(["active", "redeemed", "closed"] as const).map((s) => (
          <Link
            key={s}
            href={s === "active" ? "/jewellery/schemes" : `/jewellery/schemes?status=${s}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${status === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {s === "active" ? t("Running") : s === "redeemed" ? t("Used for jewellery") : t("Closed")}
          </Link>
        ))}
      </div>

      {status === "active" && views.length > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center">
          <div>
            <p className="text-[11px] text-muted">{t("Schemes")}</p>
            <p className="text-sm font-semibold text-foreground">{views.length}</p>
          </div>
          <div className="border-x border-border">
            <p className="text-[11px] text-muted">{t("Collected")}</p>
            <p className="text-sm font-semibold text-foreground">{formatMoney(collected)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t("Instalment late")}</p>
            <p className={`text-sm font-semibold ${overdue ? "text-danger" : "text-foreground"}`}>{overdue}</p>
          </div>
        </div>
      )}

      {views.length === 0 ? (
        <EmptyState icon={PiggyBank} title={t("No schemes here")} text={t("Start one above: the customer pays every month, and at the end buys jewellery with it plus your bonus.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map(({ scheme, figures }) => (
            <li key={scheme.id}>
              <Link href={`/jewellery/schemes/${scheme.id}`} className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{scheme.customer_name}</p>
                  <p className="truncate text-xs text-muted">
                    {scheme.scheme_number} · {formatMoney(scheme.installment_amount)} × {scheme.total_installments}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {figures.installmentsPaid}/{scheme.total_installments}
                  </p>
                  <p className={`text-[11px] font-medium ${scheme.status !== "active" ? "text-muted" : figures.complete ? "text-success" : figures.overdue ? "text-danger" : "text-muted"}`}>
                    {scheme.status === "redeemed"
                      ? t("Used")
                      : scheme.status === "closed"
                        ? t("Closed")
                        : figures.complete
                          ? t("Ready — {amount}", { amount: formatMoney(figures.value) })
                          : figures.overdue
                            ? t("Late since {date}", { date: formatIsoDate(figures.nextDue ?? "") })
                            : t("Next {date}", { date: formatIsoDate(figures.nextDue ?? "") })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
