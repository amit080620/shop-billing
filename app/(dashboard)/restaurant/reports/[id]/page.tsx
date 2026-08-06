import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

export default async function RestaurantBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("*, restaurant_tables ( name )")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!order) return <p className="text-sm text-muted">{t("rreports.notFound")}</p>;

  const [{ data: items }, { data: payments }] = await Promise.all([
    admin.from("restaurant_order_items").select("*").eq("order_id", id),
    admin.from("restaurant_order_payments").select("*").eq("order_id", id),
  ]);

  const table = Array.isArray(order.restaurant_tables) ? order.restaurant_tables[0] : order.restaurant_tables;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/restaurant/reports" className="text-sm text-muted">
        {t("rreports.backToReports")}
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-foreground">{table?.name} · #{order.order_number}</h1>
        <p className="text-xs text-muted">
          {order.settled_at && new Date(order.settled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm">
            <span className="text-foreground">{item.product_name} × {item.quantity}</span>
            <span className="text-foreground">{formatMoney(item.line_total)}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <Row label={t("rreports.subtotal")} value={formatMoney(order.subtotal)} />
        {order.discount_amount > 0 && <Row label={t("rreports.discount")} value={`− ${formatMoney(order.discount_amount)}`} />}
        <Row label={t("rreports.gst")} value={formatMoney(Number(order.cgst_amount) + Number(order.sgst_amount) + Number(order.igst_amount))} />
        <Row label={t("rreports.total")} value={formatMoney(order.total)} bold />
      </div>

      <section>
        <p className="mb-2 text-xs font-medium text-muted">{t("rreports.paidVia")}</p>
        <ul className="flex flex-col gap-1.5">
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex justify-between rounded-lg bg-brand-soft px-3 py-2 text-sm">
              <span className="capitalize text-brand-dark">{p.payment_method}</span>
              <span className="font-medium text-brand-dark">{formatMoney(p.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
