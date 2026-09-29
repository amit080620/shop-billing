import { notFound } from "next/navigation";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney, formatDateTime, paymentMethodLabel } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { goldSchemesReady, loadSchemes } from "@/lib/goldSchemeData";
import { SchemeActions } from "./SchemeActions";

export default async function GoldSchemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await goldSchemesReady(admin))) notFound();
  const [view] = await loadSchemes(admin, session.shopId, { id });
  if (!view) notFound();
  const { scheme: s, figures: f, payments } = view;

  // A passbook the customer can keep, or a gentle reminder when an instalment is due.
  const waText = [
    `*${session.shopName}*`,
    `${t("Gold saving scheme")} ${s.scheme_number}`,
    s.customer_name,
    "",
    `${t("Paid")}: ${formatMoney(f.paid)} (${f.installmentsPaid}/${s.total_installments} ${t("instalments")})`,
    f.complete ? `*${t("Complete — worth {amount} with the bonus. Come and choose your jewellery!", { amount: formatMoney(f.value) })}*` : `${t("Next instalment of {amount} due on {date}", { amount: formatMoney(s.installment_amount), date: formatIsoDate(f.nextDue ?? "") })}`,
    f.complete ? "" : `${t("At the end: {amount} of jewellery (with {bonus} bonus)", { amount: formatMoney(f.maturityValue), bonus: formatMoney(s.bonus_amount) })}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsapp = s.customer_phone && s.status === "active" ? buildWhatsAppLink(s.customer_phone, waText) : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/jewellery/schemes" />
      <PageHeader title={s.customer_name} subtitle={s.scheme_number} icon={<PiggyBank size={18} strokeWidth={1.8} />} />

      <section className="neu-card flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted">
            {formatMoney(s.installment_amount)} × {s.total_installments} · {t("started")} {formatIsoDate(s.start_date)}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {f.installmentsPaid}/{s.total_installments}
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (f.paid / f.target) * 100)}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-muted">{t("Paid")}</p>
            <p className="font-semibold text-foreground">{formatMoney(f.paid)}</p>
          </div>
          <div>
            <p className="text-muted">{t("Bonus")}</p>
            <p className="font-semibold text-foreground">{formatMoney(s.bonus_amount)}</p>
          </div>
          <div>
            <p className="text-muted">{t("At the end")}</p>
            <p className="font-semibold text-foreground">{formatMoney(f.maturityValue)}</p>
          </div>
        </div>
        {s.status === "active" &&
          (f.complete ? (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">{t("Complete — worth {amount} now, bonus included.", { amount: formatMoney(f.value) })}</p>
          ) : (
            <p className={`text-xs ${f.overdue ? "font-medium text-danger" : "text-muted"}`}>
              {f.overdue ? t("Instalment late — was due {date}", { date: formatIsoDate(f.nextDue ?? "") }) : t("Next instalment due {date}", { date: formatIsoDate(f.nextDue ?? "") })} · {t("Left to pay")} {formatMoney(f.remaining)}
            </p>
          ))}
        {s.status === "redeemed" && s.redeemed_bill_id && (
          <Link href={`/print/bill/${s.redeemed_bill_id}`} className="text-sm font-medium text-brand-text">
            {t("Used for jewellery — view the bill")} →
          </Link>
        )}
        {s.status === "closed" && <p className="text-sm text-muted">{t("Closed early · {amount} handed back", { amount: formatMoney(s.refund_amount) })}</p>}
      </section>

      {s.status === "active" && (
        <SchemeActions
          schemeId={s.id}
          installment={s.installment_amount}
          remaining={f.remaining}
          paid={f.paid}
          value={f.value}
          complete={f.complete}
          customerId={s.customer_id}
          isOwner={session.role === "owner"}
          whatsapp={whatsapp}
        />
      )}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("Passbook")}</p>
        {payments.length === 0 ? (
          <p className="text-xs text-muted">{t("No instalments yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {payments.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2 text-sm">
                <span className="text-muted">
                  #{i + 1} · {formatDateTime(p.createdAt)} · {t(paymentMethodLabel(p.method))}
                </span>
                <span className="font-medium text-foreground">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
