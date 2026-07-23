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
      .select("id, total, paid_amount, credit_amount, created_at")
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

  const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
  const totalPaidBack = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, totalCredit - totalPaidBack);

  return (
    <LedgerClient
      customer={customer}
      balance={balance}
      bills={(bills ?? []).map((b) => ({
        id: b.id,
        total: Number(b.total),
        paidAmount: Number(b.paid_amount),
        creditAmount: Number(b.credit_amount),
        createdAt: b.created_at,
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
