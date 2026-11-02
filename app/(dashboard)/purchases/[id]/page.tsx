import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { CheckCircle2, ListChecks, ShoppingCart } from "lucide-react";
import { requireArea, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { PriceAlertBanner, type PriceAlert } from "@/app/(dashboard)/vendors/[id]/PriceAlertBanner";
import { BuyAgainButton } from "./BuyAgainButton";

/** One purchase as it was entered: the vendor's bill line by line with its GST, what was paid and
 * what is still owed — and one tap to buy the same again. */
export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; rates?: string; ratesSkipped?: string; priceAlerts?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await requireSession();
  requireArea(session, "purchases");
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const { data: p } = await admin
    .from("purchases")
    .select("id, vendor_id, vendor_invoice_number, purchase_date, subtotal, taxable_amount, supply_type, cgst_amount, sgst_amount, igst_amount, gst_amount, total, paid_amount, payment_method, itc_eligible, reverse_charge, created_at")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: items }, { data: vendor }] = await Promise.all([
    admin.from("purchase_items").select("id, product_id, description, hsn_code, quantity, free_quantity, unit_price, gst_percent, line_subtotal, line_gst, line_total").eq("purchase_id", p.id).order("id"),
    admin.from("vendors").select("id, name, gstin, phone").eq("id", p.vendor_id).maybeSingle(),
  ]);
  let alerts: PriceAlert[] = [];
  try {
    alerts = sp.priceAlerts ? (JSON.parse(decodeURIComponent(sp.priceAlerts)) as PriceAlert[]) : [];
  } catch {
    alerts = [];
  }
  const lines = items ?? [];
  const due = Math.max(0, Number(p.total) - Number(p.paid_amount));
  const pieces = lines.reduce((s, l) => s + Number(l.quantity) + Number(l.free_quantity ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/purchases" />
      <PageHeader
        title={`${t("Purchase")} · ${vendor?.name ?? "—"}`}
        subtitle={`${t("Bill #{no}", { no: p.vendor_invoice_number })} · ${new Date(p.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
        icon={<ShoppingCart size={18} strokeWidth={1.8} />}
      />

      {sp.saved && (
        <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-foreground">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
          <span>
            {t("Purchase saved — {n} pieces added to stock.", { n: pieces })}
            {sp.rates ? ` ${t("{n} items got new rates in the rate list; billing uses them now.", { n: Number(sp.rates) })}` : ""}
            {sp.ratesSkipped ? ` ${t("Rates were not changed: only staff allowed to change items can do that.")}` : ""}
          </span>
        </div>
      )}
      <PriceAlertBanner alerts={alerts} />

      <section className="neu-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2">{t("Item")}</th>
              <th className="px-3 py-2 text-right">{t("Quantity")}</th>
              <th className="px-3 py-2 text-right">{t("Rate")}</th>
              <th className="px-3 py-2 text-right">GST</th>
              <th className="px-3 py-2 text-right">{t("Amount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <span className="block text-foreground">{l.description}</span>
                  {l.hsn_code && <span className="text-[11px] text-muted">HSN {l.hsn_code}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {Number(l.quantity)}
                  {Number(l.free_quantity) > 0 && <span className="text-[11px] text-brand-text"> +{Number(l.free_quantity)} {t("free")}</span>}
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(Number(l.unit_price))}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{Number(l.gst_percent)}%</td>
                <td className="px-3 py-2 text-right font-medium">{formatMoney(Number(l.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
        <Row label={t("Taxable value")} value={formatMoney(Number(p.taxable_amount))} />
        {p.supply_type === "inter" ? (
          <Row label="IGST" value={formatMoney(Number(p.igst_amount))} />
        ) : (
          <>
            <Row label="CGST" value={formatMoney(Number(p.cgst_amount))} />
            <Row label="SGST" value={formatMoney(Number(p.sgst_amount))} />
          </>
        )}
        <div className="my-1 h-px bg-border" />
        <Row label={t("Total")} value={formatMoney(Number(p.total))} bold />
        <Row label={`${t("Paid")} · ${t(paymentMethodLabel(p.payment_method))}`} value={formatMoney(Number(p.paid_amount))} />
        {due > 0 ? <Row label={t("Still to pay")} value={formatMoney(due)} danger /> : <p className="text-right text-xs font-semibold text-success">{t("Paid in full")}</p>}
        <p className="text-xs text-muted">
          {p.itc_eligible ? t("Counts for Input Tax Credit (ITC).") : t("Not counted for ITC.")}
          {p.reverse_charge ? ` ${t("Reverse charge.")}` : ""}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <BuyAgainButton
          vendorId={p.vendor_id}
          items={lines.filter((l) => l.product_id).map((l) => ({ productId: l.product_id as string, description: l.description, hsnCode: l.hsn_code, quantity: Number(l.quantity), unitPrice: Number(l.unit_price) }))}
        />
        {vendor && (
          <Link href={`/vendors/${vendor.id}`} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground">
            {due > 0 ? t("Pay vendor") : t("Vendor ledger")}
          </Link>
        )}
        <Link href="/products/rates" className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground">
          <ListChecks size={15} /> {t("Rate list")}
        </Link>
        {session.businessType === "garment" && (
          <Link href={`/garment/supplier-returns/new?vendor=${p.vendor_id}&purchase=${p.id}`} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground">
            {t("Return to supplier")}
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={`shrink-0 ${danger ? "font-semibold text-danger" : bold ? "font-semibold text-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
