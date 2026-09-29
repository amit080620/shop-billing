import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { formatMoney } from "@/lib/format";
import { A4Renderer } from "@/lib/print/A4Renderer";
import { loadQuotationDoc } from "@/lib/print/quotationDoc";
import { quotationsReady } from "@/lib/quotationsData";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";

export const metadata: Metadata = { title: "Quotation", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The customer's own copy of a quotation, from the link in the shop's WhatsApp message — the same
// trust model as the invoice and khata links: read by the unguessable id, no login, read-only,
// nothing else reachable, a wrong id just 404s.
export default async function CustomerQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = createSupabaseAdminClient();
  if (!(await quotationsReady(admin))) notFound();
  const doc = await loadQuotationDoc(admin, id);
  if (!doc) notFound();
  const { q, a4Data, expired } = doc;

  return (
    <LangProvider lang="en" messages={messagesFor("en")}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-3 bg-background px-3 py-4">
        <div className="no-print flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{a4Data.shopName}</p>
              <p className="text-xs text-muted">
                Quotation {q.quote_number} · {formatMoney(Number(q.total))}
              </p>
            </div>
            <div className="w-36 shrink-0">
              <DownloadImageButton invoiceNumber={q.quote_number} isThermal={false} />
            </div>
          </div>
          {q.status === "cancelled" && <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">This quotation was withdrawn by the shop.</p>}
          {q.status === "converted" && <p className="rounded-lg border border-success bg-success-soft px-3 py-2 text-sm text-success">This quotation has been billed. Thank you!</p>}
          {expired && <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">This quotation&apos;s validity date has passed — ask the shop for the current prices.</p>}
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          <div id="invoice-capture-area" className="bg-white text-black">
            {/* The customer's phone is left off a link that can be forwarded. */}
            <A4Renderer data={{ ...a4Data, customerPhone: null }} />
          </div>
        </div>

        <p className="no-print text-center text-xs text-muted">Shared by {a4Data.shopName} using The Ray. Reply to the shop on WhatsApp to confirm.</p>
      </div>
    </LangProvider>
  );
}
