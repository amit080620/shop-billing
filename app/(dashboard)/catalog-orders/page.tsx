import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { CatalogOrderRow } from "./CatalogOrderRow";

export default async function CatalogOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const { status } = await searchParams;
  const activeFilter = status && status !== "all" ? status : "pending";
  const admin = createSupabaseAdminClient();

  const { data: requests } = await admin
    .from("catalog_order_requests")
    .select("id, customer_name, customer_phone, notes, status, bill_id, created_at")
    .eq("shop_id", session.shopId)
    .eq("status", activeFilter as "pending" | "accepted" | "rejected")
    .order("created_at", { ascending: false })
    .limit(100);

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: allItems } = requestIds.length
    ? await admin
        .from("catalog_order_request_items")
        .select("request_id, product_name, quantity, price_at_request")
        .in("request_id", requestIds)
    : { data: [] };

  const itemsByRequest = new Map<string, { productName: string; quantity: number; price: number }[]>();
  for (const item of allItems ?? []) {
    const list = itemsByRequest.get(item.request_id) ?? [];
    list.push({ productName: item.product_name, quantity: Number(item.quantity), price: Number(item.price_at_request) });
    itemsByRequest.set(item.request_id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Catalog orders"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
          </svg>
        }
      />
      <Link href="/catalog-settings" className="text-sm text-muted">
        ← Catalog link settings
      </Link>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["pending", "accepted", "rejected"] as const).map((s) => (
          <Link
            key={s}
            href={`/catalog-orders?status=${s}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize ${
              activeFilter === s ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {(!requests || requests.length === 0) ? (
        <EmptyState text="No orders here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <CatalogOrderRow
              key={r.id}
              request={{
                id: r.id,
                customerName: r.customer_name,
                customerPhone: r.customer_phone,
                notes: r.notes,
                status: r.status,
                billId: r.bill_id,
                createdAt: r.created_at,
                items: itemsByRequest.get(r.id) ?? [],
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
