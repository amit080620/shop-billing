import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney, formatDateTime } from "@/lib/format";
import { garmentGate } from "../../gate";
import { StatusChip } from "../../ui";
import { ReturnSteps } from "./ReturnSteps";

export default async function SupplierReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await garmentGate("supplier_returns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { data: r } = await admin.from("purchase_returns").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!r) notFound();
  const [{ data: items }, { data: vendor }, { data: purchase }, { data: godown }] = await Promise.all([
    admin.from("purchase_return_items").select("id, product_name, quantity, rate, gst_percent, taxable_value, gst_amount, total, from_damaged").eq("return_id", id).order("product_name"),
    admin.from("vendors").select("name, gstin").eq("id", r.vendor_id).maybeSingle(),
    admin.from("purchases").select("vendor_invoice_number, purchase_date").eq("id", r.purchase_id).maybeSingle(),
    admin.from("godowns").select("name").eq("id", r.godown_id).maybeSingle(),
  ]);
  const posted = r.status === "posted";
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/supplier-returns" />
      <PageHeader
        title={`${t("Supplier return")} ${r.number}`}
        subtitle={`${vendor?.name ?? "—"} · ${t("Purchase")} ${purchase?.vendor_invoice_number ?? "—"} (${purchase?.purchase_date ?? ""})`}
        icon={<RotateCcw size={18} strokeWidth={1.8} />}
        action={
          posted ? (
            <Link href={`/print/garment/supplier-return/${r.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              {t("Print debit note")}
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusChip status={r.status} />
        <span>
          {t("From")} {godown?.name ?? "—"} · {r.return_date}
        </span>
      </div>
      <section className="neu-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2">{t("Item")}</th>
              <th className="px-3 py-2 text-right">{t("Quantity")}</th>
              <th className="px-3 py-2 text-right">{t("Rate")}</th>
              {posted && <th className="px-3 py-2 text-right">{t("GST")}</th>}
              {posted && <th className="px-3 py-2 text-right">{t("Total")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(items ?? []).map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">
                  {i.product_name}
                  {i.from_damaged && <span className="ml-1 text-xs text-danger">· {t("From damaged stock")}</span>}
                </td>
                <td className="px-3 py-2 text-right">{Number(i.quantity)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(Number(i.rate))}</td>
                {posted && <td className="px-3 py-2 text-right">{formatMoney(Number(i.gst_amount))}</td>}
                {posted && <td className="px-3 py-2 text-right">{formatMoney(Number(i.total))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {posted && (
        <p className="text-sm text-foreground">
          {t("Taxable {a} + GST {b} = {c}, taken off what you owe {vendor}.", { a: formatMoney(Number(r.taxable_value)), b: formatMoney(Number(r.gst_amount)), c: formatMoney(Number(r.total)), vendor: vendor?.name ?? "" })}
        </p>
      )}
      {r.status === "draft" && <ReturnSteps id={r.id} />}
      <p className="text-xs text-muted">
        {[r.reason, r.debit_note_ref && `${t("Vendor ref.")}: ${r.debit_note_ref}`, r.transporter && `${t("Transporter")}: ${r.transporter}`, r.vehicle_number && `${t("Vehicle")}: ${r.vehicle_number}`, r.lr_number && `LR: ${r.lr_number}`, r.posted_at && `${t("Posted")}: ${formatDateTime(r.posted_at)}`].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
