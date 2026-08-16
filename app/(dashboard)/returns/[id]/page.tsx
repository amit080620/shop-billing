import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: ret } = await admin
    .from("returns")
    .select(
      "return_number, bill_id, created_at, subtotal, cgst_amount, sgst_amount, igst_amount, total, refund_method, reason, bills ( invoice_number ), customers ( name, phone )",
    )
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!ret) {
    return <p className="text-sm text-muted">Return not found.</p>;
  }

  const { data: items } = await admin.from("return_items").select("id, product_name, quantity, line_total").eq("return_id", id);

  const bill = Array.isArray(ret.bills) ? ret.bills[0] : ret.bills;
  const customer = Array.isArray(ret.customers) ? ret.customers[0] : ret.customers;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/print/bill/${ret.bill_id}`} className="text-sm text-muted">
        ← Original bill
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-foreground">Return #{ret.return_number}</h1>
        <p className="text-xs text-muted">
          Against invoice #{bill?.invoice_number} · {formatDateTime(ret.created_at)}
        </p>
        {customer && <p className="text-xs text-muted">{customer.name} {customer.phone ? `· ${customer.phone}` : ""}</p>}
      </div>

      <ul className="flex flex-col gap-2">
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm">
            <span className="text-foreground">{item.product_name} × {Number(item.quantity)}</span>
            <span className="text-foreground">{formatMoney(item.line_total)}</span>
          </li>
        ))}
      </ul>

      <div className="neu-card p-4">
        <Row label="Subtotal" value={formatMoney(ret.subtotal)} />
        <Row label="GST" value={formatMoney(Number(ret.cgst_amount) + Number(ret.sgst_amount) + Number(ret.igst_amount))} />
        <Row label="Total refund" value={formatMoney(ret.total)} bold />
        <Row label="Refunded via" value={ret.refund_method === "credit_adjustment" ? "Adjusted against credit" : ret.refund_method} />
        {ret.reason && <Row label="Reason" value={ret.reason} />}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm capitalize">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
