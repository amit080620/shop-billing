import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadLrShop } from "@/lib/transportData";
import { formatIsoDate } from "@/lib/dateHelpers";
import { unitLabel } from "@/lib/format";
import { gapsReady } from "@/lib/gapsData";
import { PrintButton } from "@/app/print/bill/[id]/PrintButton";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";

/** The delivery challan on paper: goods and quantities, no prices, a place to sign on receipt. */
export default async function PrintChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await gapsReady(admin))) notFound();
  const [{ data: c }, shop] = await Promise.all([admin.from("delivery_challans").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle(), loadLrShop(admin, session.shopId)]);
  if (!c || !shop) notFound();

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <div className="mx-auto max-w-3xl bg-background p-4 text-foreground">
        <div className="no-print mb-4 flex flex-col gap-3">
          <Link href={`/challans/${c.id}`} className="text-sm font-medium text-muted hover:text-foreground">
            ← {c.challan_number}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <PrintButton />
            <DownloadImageButton invoiceNumber={c.challan_number} isThermal={false} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white">
          <div id="invoice-capture-area" className="bg-white p-6 text-black">
            <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">{shop.name}</p>
                {shop.address && <p className="text-xs text-gray-600">{shop.address}</p>}
                <p className="text-xs text-gray-600">
                  {shop.gstin ? `GSTIN: ${shop.gstin}` : ""}
                  {shop.gstin && shop.phone ? " · " : ""}
                  {shop.phone ? `Ph: ${shop.phone}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold tracking-wide">DELIVERY CHALLAN</p>
                <p className="text-sm font-semibold">{c.challan_number}</p>
                <p className="text-xs text-gray-600">{formatIsoDate(c.challan_date)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase text-gray-500">{t("To")}</p>
                <p className="font-semibold">{c.customer_name}</p>
                {c.customer_phone && <p className="text-xs text-gray-600">Ph: {c.customer_phone}</p>}
                {c.site && <p className="text-xs text-gray-600">{t("Site")}: {c.site}</p>}
              </div>
              <div className="text-right">
                {c.vehicle && (
                  <p className="text-xs text-gray-600">
                    {t("Vehicle")}: <b>{c.vehicle}</b>
                  </p>
                )}
                {c.status === "billed" && <p className="text-xs font-semibold text-green-700">{t("Billed")}</p>}
                {c.status === "cancelled" && <p className="text-xs font-semibold text-red-700">{t("Cancelled")}</p>}
              </div>
            </div>
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-400 text-left text-xs text-gray-600">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">{t("Goods")}</th>
                  <th className="py-1.5 text-right">{t("Quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((i, k) => (
                  <tr key={k} className="border-b border-gray-200">
                    <td className="py-1.5 pr-2 text-gray-500">{k + 1}</td>
                    <td className="py-1.5 pr-2">{i.name}</td>
                    <td className="py-1.5 text-right font-medium">
                      {i.quantity} {unitLabel(i.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.notes && <p className="mt-3 text-xs text-gray-600">{c.notes}</p>}
            <p className="mt-3 text-[11px] text-gray-500">{t("Goods sent for delivery. Not a bill — the tax invoice follows.")}</p>
            <div className="mt-10 grid grid-cols-2 gap-6 text-xs">
              <div className="border-t border-gray-400 pt-1">
                {t("Received the goods in good condition")}
                {c.received_by ? ` — ${c.received_by}` : ""}
              </div>
              <div className="border-t border-gray-400 pt-1 text-right">{t("For {shop}", { shop: shop.name })}</div>
            </div>
          </div>
        </div>
      </div>
    </LangProvider>
  );
}
