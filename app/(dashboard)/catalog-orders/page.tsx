import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { CatalogOrderRow } from "./CatalogOrderRow";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function CatalogOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; deliveryView?: string }>;
}) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "public_catalog")) return <ModuleBlocked moduleKey="public_catalog" />;
  const { status, deliveryView } = await searchParams;
  const activeFilter = status && status !== "all" ? status : "pending";
  // Genuinely only meaningful within the "accepted" tab — "Active Home
  // Delivery" (still in progress, or not a delivery order at all) vs
  // "Delivery History" (genuinely completed deliveries only).
  const activeDeliveryView = deliveryView === "history" ? "history" : "active";
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("catalog_order_requests")
    .select("id, customer_name, customer_phone, notes, status, bill_id, wants_delivery, delivery_status, created_at")
    .eq("shop_id", session.shopId)
    .eq("status", activeFilter as "pending" | "accepted" | "rejected");

  if (activeFilter === "accepted") {
    query =
      activeDeliveryView === "history"
        ? query.eq("wants_delivery", true).eq("delivery_status", "completed")
        : query.or("wants_delivery.eq.false,delivery_status.is.null,delivery_status.neq.completed");
  }

  const { data: requests } = await query.order("created_at", { ascending: false }).limit(100);

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
         
        icon={<ShoppingBag size={17} strokeWidth={1.8} />}
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
              activeFilter === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {activeFilter === "accepted" && (
        <div className="flex gap-2">
          {(["active", "history"] as const).map((v) => (
            <Link
              key={v}
              href={`/catalog-orders?status=accepted&deliveryView=${v}`}
              className={`flex-1 rounded-xl py-2 text-center text-sm font-semibold ${
                activeDeliveryView === v ? "bg-brand text-white" : "border border-border text-muted"
              }`}
            >
              {v === "active" ? "Active Home Delivery" : "Delivery History"}
            </Link>
          ))}
        </div>
      )}

      {(!requests || requests.length === 0) ? (
        <EmptyState
          text={
            activeFilter === "accepted" && activeDeliveryView === "history"
              ? "No completed deliveries yet — they'll appear here once a delivery is marked Completed."
              : activeFilter === "pending"
                ? "No orders waiting for review right now."
                : "No orders here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {requests.map((r) => (
            <CatalogOrderRow
              key={r.id}
              businessType={session.businessType}
              shopUpiId={session.shopUpiId}
              shopName={session.shopName}
              request={{
                id: r.id,
                customerName: r.customer_name,
                customerPhone: r.customer_phone,
                notes: r.notes,
                status: r.status,
                wantsDelivery: r.wants_delivery,
                deliveryStatus: r.delivery_status,
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
