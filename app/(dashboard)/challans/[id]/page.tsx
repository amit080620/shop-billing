import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatIsoDate } from "@/lib/dateHelpers";
import { unitLabel } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { gapsReady } from "@/lib/gapsData";
import { ChallanActions } from "./ChallanActions";

export default async function ChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await gapsReady(admin))) notFound();
  const { data: c } = await admin.from("delivery_challans").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!c) notFound();
  const { data: bill } = c.bill_id ? await admin.from("bills").select("invoice_number").eq("id", c.bill_id).maybeSingle() : { data: null };

  const text = [
    `*${session.shopName}* — ${t("Delivery challan")} ${c.challan_number}`,
    `${t("Date")}: ${formatIsoDate(c.challan_date)}`,
    c.site ? `${t("Site")}: ${c.site}` : null,
    c.vehicle ? `${t("Vehicle")}: ${c.vehicle}` : null,
    "",
    ...c.items.map((i) => `• ${i.name} — ${i.quantity} ${unitLabel(i.unit)}`),
    "",
    t("Please check the goods. The bill follows."),
  ]
    .filter((x) => x !== null)
    .join("\n");

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/challans" />
      <PageHeader title={c.challan_number} subtitle={`${c.customer_name} · ${formatIsoDate(c.challan_date)}`} icon={<Truck size={18} strokeWidth={1.8} />} />
      <section className="neu-card flex flex-col gap-2 p-3.5 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {c.customer_phone && <span>{c.customer_phone}</span>}
          {c.site && <span>{t("Site")}: {c.site}</span>}
          {c.vehicle && <span>{t("Vehicle")}: {c.vehicle}</span>}
          <span>{c.stock_taken ? t("Goods left stock with this challan") : t("Stock moves when billed")}</span>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {c.items.map((i, k) => (
            <li key={k} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-foreground">{i.name}</span>
              <span className="shrink-0 font-medium text-foreground">
                {i.quantity} {unitLabel(i.unit)}
              </span>
            </li>
          ))}
        </ul>
        {c.received_by && <p className="text-xs text-success">{t("Received by {name}", { name: c.received_by })}</p>}
        {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
      </section>

      {c.status === "billed" && c.bill_id && (
        <Link href={`/print/bill/${c.bill_id}`} className="rounded-xl border border-success bg-success-soft px-4 py-2.5 text-center text-sm font-medium text-success">
          {t("Billed — {invoice} →", { invoice: bill?.invoice_number ?? "" })}
        </Link>
      )}
      {c.status === "cancelled" && <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-center text-sm text-danger">{t("Cancelled")}</p>}

      <div className="flex flex-wrap gap-2">
        {c.customer_phone && (
          <a href={buildWhatsAppLink(c.customer_phone, text)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-success px-3 py-1.5 text-xs font-medium text-success">
            {t("WhatsApp to party")}
          </a>
        )}
        <Link href={`/print/challan/${c.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground">
          {t("Print / PDF")}
        </Link>
      </div>
      <ChallanActions id={c.id} status={c.status} receivedBy={c.received_by ?? ""} />
    </div>
  );
}
