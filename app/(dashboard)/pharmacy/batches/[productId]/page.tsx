import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AddBatchForm } from "./AddBatchForm";
import { DeleteBatchButton } from "./DeleteBatchButton";
import { WriteOffButton } from "./WriteOffButton";

function daysUntil(dateStr: string) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function BatchesPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await requireSession();
  const { productId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("id, name, unit, stock_quantity")
    .eq("id", productId)
    .eq("shop_id", session.shopId)
    .single();

  if (!product) return <p className="text-sm text-muted">Medicine not found.</p>;

  const { data: batches } = await admin
    .from("medicine_batches")
    .select("*")
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/products" className="text-sm text-muted">
        ← Inventory
      </Link>

      <PageHeader
        title={product.name}
        subtitle={`${Number(product.stock_quantity)} ${product.unit} total across all batches`}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2h6M10 2v5.5L5 15a3 3 0 0 0 2.5 4.7h9a3 3 0 0 0 2.5-4.7L14 7.5V2" />
          </svg>
        }
      />

      <AddBatchForm productId={product.id} />

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Batches (earliest expiry first)</p>
        {(!batches || batches.length === 0) ? (
          <EmptyState text="No batches yet — add the first one above when new stock arrives." />
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
                      Batch {b.batch_number} · {Number(b.quantity)} {product.unit}
                    </p>
                    <p className={`text-xs ${tone === "expired" || tone === "critical" ? "text-danger" : "text-muted"}`}>
                      Expires {new Date(b.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {days < 0 ? " · EXPIRED" : ` · ${days}d left`}
                      {b.manufacturer ? ` · ${b.manufacturer}` : ""}
                    </p>
                    {b.purchase_price != null && (
                      <p className="text-xs text-muted">Cost {formatMoney(Number(b.purchase_price))}/unit</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <WriteOffButton
                      batchId={b.id}
                      productId={product.id}
                      batchNumber={b.batch_number}
                      maxQuantity={Number(b.quantity)}
                      unit={product.unit}
                    />
                    <DeleteBatchButton batchId={b.id} productId={product.id} />
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
