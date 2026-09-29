import type { createSupabaseAdminClient } from "./supabase/admin";
import { schemeFigures } from "./goldScheme";
import { todayIso } from "./dateHelpers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0047 (gold schemes) has been applied. */
export async function goldSchemesReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("gold_schemes").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

const COLUMNS = "id, scheme_number, customer_id, customer_name, customer_phone, installment_amount, total_installments, bonus_amount, start_date, status, redeemed_bill_id, redeemed_at, closed_at, refund_amount, notes, created_at";

/** Schemes with what has been paid into each and where each stands. */
export async function loadSchemes(admin: Admin, shopId: string, opts: { id?: string; customerId?: string; status?: "active" | "redeemed" | "closed" } = {}) {
  let q = admin.from("gold_schemes").select(COLUMNS).eq("shop_id", shopId).order("created_at", { ascending: false }).limit(300);
  if (opts.id) q = q.eq("id", opts.id);
  if (opts.customerId) q = q.eq("customer_id", opts.customerId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data: schemes } = await q;
  if (!schemes?.length) return [];
  const { data: payments } = await admin
    .from("gold_scheme_payments")
    .select("id, scheme_id, amount, payment_method, created_at")
    .eq("shop_id", shopId)
    .in("scheme_id", schemes.map((s) => s.id))
    .order("created_at");
  const today = todayIso();
  return schemes.map((s) => {
    const own = (payments ?? []).filter((p) => p.scheme_id === s.id);
    const figures = schemeFigures({
      installmentAmount: Number(s.installment_amount),
      totalInstallments: s.total_installments,
      bonusAmount: Number(s.bonus_amount),
      paid: own.reduce((sum, p) => sum + Number(p.amount), 0),
      startDate: s.start_date,
      today,
    });
    return {
      scheme: { ...s, installment_amount: Number(s.installment_amount), bonus_amount: Number(s.bonus_amount), refund_amount: Number(s.refund_amount) },
      payments: own.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.payment_method, createdAt: p.created_at })),
      figures,
    };
  });
}

export type SchemeView = Awaited<ReturnType<typeof loadSchemes>>[number];
