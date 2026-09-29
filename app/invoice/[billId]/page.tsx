import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IndianRupee } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { formatMoney } from "@/lib/format";
import { A4Renderer } from "@/lib/print/A4Renderer";
import { loadBillInvoice } from "@/lib/print/billInvoice";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The customer's own copy of an invoice, from the link in the shop's WhatsApp message. Looked up
// by the bill's UUID — unguessable, and only ever sent to that customer. Same trust model as the
// khata and catalog links: no login, read-only, nothing else reachable, a wrong id just 404s.
export default async function CustomerInvoicePage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  if (!UUID.test(billId)) notFound();

  const invoice = await loadBillInvoice(createSupabaseAdminClient(), billId);
  if (!invoice) notFound();
  const { bill, shop, upiLink, a4Data } = invoice;
  const due = Number(bill.credit_amount);

  return (
    <LangProvider lang="en" messages={messagesFor("en")}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-3 bg-background px-3 py-4">
        <div className="no-print flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{shop.name}</p>
              <p className="text-xs text-muted">
                Invoice {bill.invoice_number} · {formatMoney(bill.total)}
              </p>
            </div>
            <div className="w-36 shrink-0">
              <DownloadImageButton invoiceNumber={bill.invoice_number} upiLink={upiLink} isThermal={false} />
            </div>
          </div>
          {bill.status === "voided" && (
            <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
              This invoice was cancelled by the shop. It is kept here for your records only.
            </p>
          )}
          {upiLink && due > 0 && (
            <a href={upiLink} className="btn-primary flex items-center justify-center gap-2 text-center">
              <IndianRupee size={15} /> Pay {formatMoney(due)} now
            </a>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          {/* The same invoice the shop's own bill screen shows; the PDF is made from this. */}
          <div id="invoice-capture-area" className="bg-white text-black">
            {/* The customer's phone is left off a link that can be forwarded. */}
            <A4Renderer data={{ ...a4Data, customerPhone: null }} />
          </div>
        </div>

        <p className="no-print text-center text-xs text-muted">
          Shared by {shop.name} using The Ray. Contact the shop directly if anything looks wrong.
        </p>
      </div>
    </LangProvider>
  );
}
