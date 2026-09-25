import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ShareExpiryWhatsApp } from "./ShareExpiryWhatsApp";
import { DistributorReturnDraft } from "./DistributorReturnDraft";
import { AlertCircle } from "lucide-react";
import { BackLink } from "@/app/components/BackLink";

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** For each product with a batch worth returning, the vendor of its
 * MOST RECENT purchase (first row after ordering purchase_items by
 * purchase date, descending) stands in for "who supplied this stock"
 * — there's no batch-level purchase link in the schema, and re-buying
 * the same medicine from a different distributor between orders is
 * the rare case, not the common one. */
async function buildVendorGroups(admin: Admin, shopId: string, batches: BatchRow[]) {
  const productIds = [...new Set(batches.map((b) => b.product_id))];
  const { data: purchaseItems } = await admin
    .from("purchase_items")
    .select("product_id, purchases!inner ( purchase_date, shop_id, vendor_id, vendors ( id, name, phone ) )")
    .in("product_id", productIds)
    .eq("purchases.shop_id", shopId)
    .order("purchase_date", { foreignTable: "purchases", ascending: false });

  const vendorByProduct = new Map<string, { id: string; name: string; phone: string | null }>();
  for (const row of purchaseItems ?? []) {
    if (!row.product_id || vendorByProduct.has(row.product_id)) continue;
    const purchase = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases;
    const vendor = purchase ? (Array.isArray(purchase.vendors) ? purchase.vendors[0] : purchase.vendors) : null;
    if (vendor) vendorByProduct.set(row.product_id, vendor);
  }

  const groups = new Map<string, { vendorId: string; vendorName: string; vendorPhone: string | null; rows: ReturnType<typeof toRow>[] }>();
  for (const b of batches) {
    const vendor = vendorByProduct.get(b.product_id);
    if (!vendor) continue;
    const existing = groups.get(vendor.id) ?? { vendorId: vendor.id, vendorName: vendor.name, vendorPhone: vendor.phone, rows: [] };
    existing.rows.push(toRow(b));
    groups.set(vendor.id, existing);
  }
  return [...groups.values()];
}

export default async function ExpiryAlertsPage() {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 90);

  const { data: batches } = await admin
    .from("medicine_batches")
    .select("id, batch_number, expiry_date, quantity, product_id, products ( id, name, unit )")
    .eq("shop_id", session.shopId)
    .lte("expiry_date", cutoff.toISOString().slice(0, 10))
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true });

  const expired = (batches ?? []).filter((b) => daysUntil(b.expiry_date) < 0);
  const critical = (batches ?? []).filter((b) => { const d = daysUntil(b.expiry_date); return d >= 0 && d <= 30; });
  const upcoming = (batches ?? []).filter((b) => { const d = daysUntil(b.expiry_date); return d > 30 && d <= 90; });

  // Worth a return conversation now (not the 31-90 day "keep an eye on
  // it" bucket) — grouped by whichever vendor each product was most
  // recently bought from, inferred from purchase history rather than
  // a manual per-batch mapping step nobody would keep up with.
  const returnable = [...expired, ...critical];
  const returnGroups = returnable.length > 0 ? await buildVendorGroups(admin, session.shopId, returnable) : [];

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/pharmacy" />
      <PageHeader
        title={t("expiry.title")}
        subtitle={t("expiry.subtitle")}
        icon={<AlertCircle size={18} strokeWidth={1.8} />}
      />

      {(!batches || batches.length === 0) ? (
        <EmptyState text={t("expiry.empty")} />
      ) : (
        <>
          <ShareExpiryWhatsApp
            shopName={session.shopName}
            lang={lang}
            expired={expired.map(toRow)}
            critical={critical.map(toRow)}
          />
          <DistributorReturnDraft groups={returnGroups} shopName={session.shopName} lang={lang} />
          {expired.length > 0 && <Group title={t("expiry.alreadyExpired", { count: expired.length })} batches={expired} t={t} />}
          {critical.length > 0 && <Group title={t("expiry.within30", { count: critical.length })} batches={critical} t={t} />}
          {upcoming.length > 0 && <Group title={t("expiry.days31to90", { count: upcoming.length })} batches={upcoming} t={t} />}
        </>
      )}
    </div>
  );
}

function toRow(b: BatchRow) {
  const product = Array.isArray(b.products) ? b.products[0] : b.products;
  return {
    name: product?.name ?? "Medicine",
    batchNumber: b.batch_number,
    quantity: Number(b.quantity),
    unit: product?.unit ?? "",
    expiryDate: b.expiry_date,
    daysLeft: daysUntil(b.expiry_date),
  };
}

type BatchRow = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  product_id: string;
  products: { id: string; name: string; unit: string } | { id: string; name: string; unit: string }[] | null;
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function Group({ title, batches, t }: { title: string; batches: BatchRow[]; t: Translator }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
        {batches.map((b) => {
          const product = Array.isArray(b.products) ? b.products[0] : b.products;
          const days = daysUntil(b.expiry_date);
          return (
            <li key={b.id}>
              <Link
                href={`/pharmacy/batches/${b.product_id}`}
                className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{product?.name ?? "Medicine"}</p>
                  <p className="text-xs text-muted">
                    {t("expiry.batchLine", {
                      number: b.batch_number,
                      qty: Number(b.quantity),
                      unit: product?.unit ?? "",
                      date: new Date(b.expiry_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }),
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-danger">
                  {days < 0 ? t("expiry.expired") : t("expiry.daysShort", { days })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
