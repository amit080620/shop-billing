import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadConsignment, loadLrShop, transportExtrasReady } from "@/lib/transportData";
import { LrDocument } from "@/lib/print/LrDocument";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";

const COPIES = ["Consignor copy", "Consignee copy", "Driver copy", "Office copy"] as const;

/** The bilty on paper: one copy at a time (consignor, consignee, driver, office), printed or
 * saved as a PDF. */
export default async function PrintLrPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copy?: string }> }) {
  const { id } = await params;
  const { copy: copyParam } = await searchParams;
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await transportExtrasReady(admin))) notFound();
  const [c, shop] = await Promise.all([loadConsignment(admin, id, session.shopId), loadLrShop(admin, session.shopId)]);
  if (!c || !shop) notFound();
  const copy = COPIES.find((x) => x === copyParam) ?? COPIES[0];

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <div className="mx-auto max-w-3xl bg-background p-4 text-foreground">
        <div className="no-print mb-4 flex flex-col gap-3">
          <Link href={`/transport/lr/${c.id}`} className="text-sm font-medium text-muted hover:text-foreground">
            ← {c.lr_number}
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {COPIES.map((k) => (
              <Link key={k} href={`/print/lr/${c.id}?copy=${encodeURIComponent(k)}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${k === copy ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {t(k)}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PrintButton />
            <DownloadImageButton invoiceNumber={c.lr_number} isThermal={false} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white">
          <div id="invoice-capture-area" className="bg-white text-black">
            <LrDocument c={c} shop={shop} copy={copy} />
          </div>
        </div>
      </div>
    </LangProvider>
  );
}
