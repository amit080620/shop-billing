import Link from "@/lib/link";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney } from "@/lib/format";
import { garmentGate } from "../gate";
import { StatusChip } from "../ui";

export default async function SupplierReturnsPage() {
  const gate = await garmentGate("supplier_returns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { data: rows } = await admin.from("purchase_returns").select("id, number, return_date, vendor_id, status, total").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(200);
  const vendorIds = [...new Set((rows ?? []).map((r) => r.vendor_id))];
  const { data: vendors } = vendorIds.length ? await admin.from("vendors").select("id, name").in("id", vendorIds) : { data: [] };
  const vendor = new Map((vendors ?? []).map((v) => [v.id, v.name]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader
        title={t("Supplier returns")}
        subtitle={t("Goods back to the vendor against a purchase, with a debit note")}
        icon={<RotateCcw size={18} strokeWidth={1.8} />}
        action={
          <Link href="/garment/supplier-returns/new" className="btn-primary-sm">
            + {t("Return")}
          </Link>
        }
      />
      {(rows ?? []).length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Nothing here.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(rows ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/garment/supplier-returns/${r.id}`} className="neu-card flex items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {r.number} <span className="text-xs font-normal text-muted">· {r.return_date}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {vendor.get(r.vendor_id) ?? "—"}
                    {r.status === "posted" && ` · ${formatMoney(Number(r.total))}`}
                  </span>
                </span>
                <StatusChip status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
