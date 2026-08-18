import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

// Status is looked up by the order's own UUID — unguessable, and the
// only thing the customer has. Deliberately no shop login required and
// no other customer's data reachable: a wrong/expired id just 404s.
export default async function OrderStatusPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("catalog_order_requests")
    .select("id, customer_name, status, wants_delivery, delivery_charge, created_at, shop_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: shop }, { data: items }] = await Promise.all([
    admin.from("shops").select("name, logo_url").eq("id", order.shop_id).single(),
    admin
      .from("catalog_order_request_items")
      .select("product_name, quantity, price_at_request")
      .eq("request_id", orderId),
  ]);

  const itemsTotal = (items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.price_at_request), 0);
  const total = itemsTotal + (order.wants_delivery ? Number(order.delivery_charge) : 0);

  const statusView = {
    pending: {
      icon: <Clock size={28} className="text-warning" />,
      title: "Waiting for the shop to confirm",
      note: "We've sent your order through. You'll see it update here once the shop accepts it.",
      tone: "bg-warning-soft text-warning",
    },
    accepted: {
      icon: <CheckCircle2 size={28} className="text-success" />,
      title: "Confirmed — being prepared",
      note: "The shop has accepted your order and is working on it now.",
      tone: "bg-success-soft text-success",
    },
    rejected: {
      icon: <XCircle size={28} className="text-danger" />,
      title: "Couldn't be accepted",
      note: "The shop wasn't able to take this order. Please contact them directly if you need help.",
      tone: "bg-danger-soft text-danger",
    },
  }[order.status];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {shop?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small shop logo
          <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-full object-contain" />
        )}
        <h1 className="text-lg font-bold text-foreground">{shop?.name}</h1>
        <p className="text-xs text-muted">Order placed {formatDateTime(order.created_at)}</p>
      </div>

      <div className="neu-card flex flex-col items-center gap-2 p-5 text-center">
        {statusView.icon}
        <p className="text-base font-semibold text-foreground">{statusView.title}</p>
        <p className="text-xs text-muted">{statusView.note}</p>
      </div>

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-xs font-medium text-muted">Your order</p>
        <ul className="flex flex-col gap-1.5">
          {(items ?? []).map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {item.product_name} × {item.quantity}
              </span>
              <span className="shrink-0 text-muted">
                {formatMoney(Number(item.quantity) * Number(item.price_at_request))}
              </span>
            </li>
          ))}
        </ul>
        {order.wants_delivery && Number(order.delivery_charge) > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted">Delivery</span>
            <span className="text-foreground">{formatMoney(Number(order.delivery_charge))}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-bold text-foreground neu-text">{formatMoney(total)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Save this page — refresh it any time to see the latest status.
      </p>
    </div>
  );
}
