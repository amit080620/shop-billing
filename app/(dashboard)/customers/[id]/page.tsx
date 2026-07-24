import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LedgerClient } from "./LedgerClient";

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, phone")
    .eq("id", id)
    .eq("shop_id", session.shopId) // ownership check
    .single();

  if (!customer) notFound();

  const [{ data: bills }, { data: payments }] = await Promise.all([
    admin
      .from("bills")
      .select("id, invoice_number, total, paid_amount, credit_amount, status, created_at")
      .eq("customer_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
    admin
      .from("payments")
      .select("id, amount, note, created_at")
      .eq("customer_id", id)
      .eq("shop_id", session.shopId)
      .order("created_at", { ascending: false }),
  ]);

  const billIds = (bills ?? []).map((b) => b.id);
  const { data: items } = billIds.length
    ? await admin
        .from("bill_items")
        .select("bill_id, product_name, quantity, unit_price, line_total")
        .in("bill_id", billIds)
    : { data: [] as { bill_id: string; product_name: string; quantity: number; unit_price: number; line_total: number }[] };

  const itemsByBill = new Map<string, { name: string; quantity: number; unitPrice: number; lineTotal: number }[]>();
  for (const item of items ?? []) {
    const list = itemsByBill.get(item.bill_id) ?? [];
    list.push({
      name: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    });
    itemsByBill.set(item.bill_id, list);
  }

  const activeBills = (bills ?? []).filter((b) => b.status === "active");
  const totalCredit = activeBills.reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, totalCredit - totalPaidBack);

  return (
    <LedgerClient
      customer={customer}
      shopName={session.shopName}
      balance={balance}
      bills={(bills ?? []).map((b) => ({
        id: b.id,
        invoiceNumber: b.invoice_number,
        total: Number(b.total),
        paidAmount: Number(b.paid_amount),
        creditAmount: Number(b.credit_amount),
        status: b.status,
        createdAt: b.created_at,
        items: itemsByBill.get(b.id) ?? [],
      }))}
      payments={(payments ?? []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note,
        createdAt: p.created_at,
      }))}
    />
  );
}
