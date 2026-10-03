import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { A4Renderer } from "@/lib/print/A4Renderer";
import { loadQuotationDoc, quotationWhatsAppText } from "@/lib/print/quotationDoc";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";
import { SharePdfButton } from "@/app/print/bill/[id]/SharePdfButton";
import { CancelQuotationButton } from "./CancelQuotationButton";
import { quotationsReady } from "@/lib/quotationsData";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "quotations")) return <ModuleBlocked moduleKey="quotations" />;
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await quotationsReady(admin))) notFound();

  const doc = await loadQuotationDoc(admin, id, session.shopId);
  if (!doc) notFound();
  const { q, a4Data, expired } = doc;

  // The customer's own copy: a link that opens this quotation (with a PDF button) without a login.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "bill.theray.in";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const pdfUrl = q.status === "cancelled" ? null : `${protocol}://${host}/quote/${q.id}`;
  const phone = a4Data.customerPhone;
  const whatsapp = phone ? buildWhatsAppLink(phone, quotationWhatsAppText(doc, pdfUrl)) : null;

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <div className="mx-auto max-w-2xl bg-background p-4 text-foreground md:p-8">
        <div className="no-print mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/quotations" className="text-sm font-medium text-muted hover:text-foreground">
              {t("← Quotations")}
            </Link>
            {q.status === "open" && (
              <Link href={`/bills/new?quote=${q.id}`} className="btn-primary-sm">
                {t("Make bill →")}
              </Link>
            )}
          </div>

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{a4Data.customerName ?? t("common.walkinCustomer")}</p>
                <p className="text-xs text-muted">{q.quote_number}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-tight text-foreground">{formatMoney(Number(q.total))}</p>
                <p className={`text-xs font-medium ${q.status === "converted" ? "text-success" : q.status === "cancelled" || expired ? "text-danger" : "text-brand-text"}`}>
                  {q.status === "converted" ? t("Billed") : q.status === "cancelled" ? t("Cancelled") : expired ? t("Expired") : t("Open")}
                </p>
              </div>
            </div>
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-center font-medium text-white">
                {t("Send quotation on WhatsApp")}
              </a>
            ) : (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t("No phone on this quotation — pick a customer on New Bill to send it on WhatsApp.")}</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <PrintButton />
              <DownloadImageButton invoiceNumber={q.quote_number} isThermal={false} />
              <SharePdfButton invoiceNumber={q.quote_number} shopName={a4Data.shopName} isThermal={false} />
            </div>
            <div className="flex flex-wrap gap-2">
              {q.status === "converted" && q.bill_id && (
                <Link href={`/print/bill/${q.bill_id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
                  {t("View the bill")}
                </Link>
              )}
              {q.status === "open" && <CancelQuotationButton quotationId={q.id} />}
            </div>
            {q.status === "open" &&
              (expired ? (
                <p className="text-xs text-danger">{t("This quotation's validity date has passed — Make bill uses today's prices.")}</p>
              ) : (
                <p className="text-xs text-muted">{t("Make bill keeps these quoted prices while the quotation is valid.")}</p>
              ))}
          </section>
        </div>

        <div id="invoice-capture-area" className="bg-white text-black">
          <A4Renderer data={a4Data} />
        </div>
      </div>
    </LangProvider>
  );
}
