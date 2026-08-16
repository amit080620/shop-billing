import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AddBatchForm } from "./AddBatchForm";
import { DeleteBatchButton } from "./DeleteBatchButton";
import { WriteOffButton } from "./WriteOffButton";
import { Package } from "lucide-react";

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function BatchesPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await requireSession();
  const { t, lang } = await getTranslator();
  const { productId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("id, name, unit, stock_quantity")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();

  if (!product) return <p className="text-sm text-muted">{t("batches.notFound")}</p>;

  const { data: batches } = await admin
    .from("medicine_batches")
    .select("id, batch_number, expiry_date, quantity, manufacturer, purchase_price")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/products" className="text-sm text-muted">
        {t("batches.backToInventory")}
      </Link>

      <PageHeader
        title={product.name}
        subtitle={t("batches.totalAcross", { qty: Number(product.stock_quantity), unit: product.unit })}
        icon={<Package size={18} strokeWidth={1.8} />}
      />

      <AddBatchForm productId={product.id} lang={lang} />

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("batches.heading")}</p>
        {(!batches || batches.length === 0) ? (
          <EmptyState text={t("batches.empty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {batches.map((b) => {
              const days = daysUntil(b.expiry_date);
              const tone = days < 0 ? "expired" : days <= 30 ? "critical" : days <= 90 ? "warn" : "ok";
              return (
                <li
                  key={b.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
                    tone === "expired" || tone === "critical"
                      ? "border-danger bg-red-50"
                      : tone === "warn"
                        ? "border-border"
                        : "border-border bg-surface"
                  }`}
                  style={tone === "warn" ? { backgroundColor: "#fef6ea" } : undefined}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t("batches.batchLabel", { number: b.batch_number, qty: Number(b.quantity), unit: product.unit })}
                    </p>
                    <p className={`text-xs ${tone === "expired" || tone === "critical" ? "text-danger" : "text-muted"}`}>
                      {t("batches.expires", { date: new Date(b.expiry_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) })}
                      {" · "}
                      {days < 0 ? t("batches.expired") : t("batches.daysLeft", { days })}
                      {b.manufacturer ? ` · ${b.manufacturer}` : ""}
                    </p>
                    {b.purchase_price != null && (
                      <p className="text-xs text-muted">{t("batches.cost", { price: formatMoney(Number(b.purchase_price)) })}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <WriteOffButton
                      batchId={b.id}
                      productId={product.id}
                      batchNumber={b.batch_number}
                      maxQuantity={Number(b.quantity)}
                      unit={product.unit}
                      lang={lang}
                    />
                    <DeleteBatchButton batchId={b.id} productId={product.id} lang={lang} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
