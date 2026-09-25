import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/dateHelpers";
import { formatMoney } from "@/lib/format";
import type { Lang } from "@/lib/i18n/dictionary";
import { translate, interpolate } from "@/lib/i18n/dictionary";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type Move = {
  id: string;
  title: string;
  detail: string;
  href: string;
  penalty: number;
};

/** The one cross-business feature no competing billing app has: instead
 * of scattered alert banners, every shop gets a single 0-100 health
 * score plus the 3 things most worth doing about it today, ranked by
 * real rupee/customer impact and each one tap away from the exact
 * screen that fixes it. Computed fresh (cheap — count-scale queries,
 * no AI call) so it can run on every dashboard load. */
export async function computeTodaysMoves(shopId: string, businessType: string, lang: Lang): Promise<{ score: number; moves: Move[] }> {
  const t = (key: string, values?: Record<string, string | number>) => (values ? interpolate(translate(lang, key), values) : translate(lang, key));
  const admin = createSupabaseAdminClient();

  const candidates = (
    await Promise.all([
      cashMove(admin, shopId, t),
      customerMove(admin, shopId, t),
      stockMove(admin, shopId, t),
      expiryMove(admin, shopId, t),
      businessType === "gym" ? membershipMove(admin, shopId, t) : null,
      businessType === "clinic" ? followUpMove(admin, shopId, t) : null,
      businessType === "transport" ? vehicleDocsMove(admin, shopId, t) : null,
      businessType === "service" ? serviceJobsMove(admin, shopId, t) : null,
      businessType === "rental" ? rentalsMove(admin, shopId, t) : null,
    ])
  ).filter((m): m is Move => m !== null);

  const penalty = candidates.reduce((s, m) => s + m.penalty, 0);
  const score = Math.max(0, Math.round(100 - Math.min(100, penalty)));
  const moves = candidates.sort((a, b) => b.penalty - a.penalty).slice(0, 3);
  return { score, moves };
}

type T = (key: string, values?: Record<string, string | number>) => string;

/** Overdue udhar — same "oldest unpaid, 14+ days" definition the
 * assistant's own get_overdue_udhar tool uses, so the number here
 * never disagrees with what the assistant would tell you. */
async function cashMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: creditBills }, { data: creditOrders }, { data: payments }] = await Promise.all([
    admin.from("bills").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active").gt("credit_amount", 0),
    admin.from("restaurant_orders").select("customer_id, credit_amount, settled_at").eq("shop_id", shopId).eq("status", "settled").gt("credit_amount", 0),
    admin.from("payments").select("customer_id, amount").eq("shop_id", shopId),
  ]);
  const creditByCustomer = new Map<string, number>();
  const oldestByCustomer = new Map<string, string>();
  for (const b of [
    ...(creditBills ?? []).map((b) => ({ customer_id: b.customer_id, credit_amount: b.credit_amount, at: b.created_at as string })),
    ...(creditOrders ?? []).map((o) => ({ customer_id: o.customer_id, credit_amount: o.credit_amount, at: (o.settled_at as string) ?? "" })),
  ]) {
    if (!b.customer_id) continue;
    creditByCustomer.set(b.customer_id, (creditByCustomer.get(b.customer_id) ?? 0) + Number(b.credit_amount));
    const existing = oldestByCustomer.get(b.customer_id);
    if (!existing || b.at < existing) oldestByCustomer.set(b.customer_id, b.at);
  }
  const paidByCustomer = new Map<string, number>();
  for (const p of payments ?? []) {
    if (!p.customer_id) continue;
    paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
  }
  let count = 0;
  let totalOutstanding = 0;
  for (const [customerId, credit] of creditByCustomer.entries()) {
    const outstanding = Math.max(0, credit - (paidByCustomer.get(customerId) ?? 0));
    const oldest = oldestByCustomer.get(customerId)!;
    if (outstanding > 0 && oldest < cutoff) {
      count++;
      totalOutstanding += outstanding;
    }
  }
  if (count === 0) return null;
  return {
    id: "cash",
    title: t("move.cash.title", { amount: formatMoney(Math.round(totalOutstanding)) }),
    detail: t("move.cash.detail", { n: count }),
    href: "/reminders",
    penalty: Math.min(35, count * 7),
  };
}

/** Same adaptive "gone quiet vs. their own usual gap" algorithm as the
 * Win-back report, so this number and that report's list are always
 * the same list, never two different opinions about who's lapsed. */
async function customerMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const { data: bills } = await admin
    .from("bills")
    .select("customer_id, created_at")
    .eq("shop_id", shopId)
    .eq("status", "active")
    .not("customer_id", "is", null)
    .order("created_at", { ascending: true });

  const billDatesByCustomer = new Map<string, string[]>();
  for (const b of bills ?? []) {
    if (!b.customer_id) continue;
    (billDatesByCustomer.get(b.customer_id) ?? billDatesByCustomer.set(b.customer_id, []).get(b.customer_id)!).push(b.created_at);
  }

  const today = Date.now();
  let count = 0;
  for (const dates of billDatesByCustomer.values()) {
    if (dates.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    const avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const lastOrderDays = (today - new Date(dates[dates.length - 1]).getTime()) / 86400000;
    const threshold = Math.max(14, avgGapDays * 2.5);
    if (lastOrderDays >= threshold) count++;
  }
  if (count === 0) return null;
  return {
    id: "winback",
    title: t("move.winback.title", { n: count }),
    detail: t("move.winback.detail"),
    href: "/reports/win-back",
    penalty: Math.min(25, count * 5),
  };
}

async function stockMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const { data } = await admin.from("products").select("id, stock_quantity, low_stock_threshold").eq("shop_id", shopId).eq("track_inventory", true);
  if (!data || data.length === 0) return null;
  const count = data.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)).length;
  if (count === 0) return null;
  return {
    id: "stock",
    title: t("move.stock.title", { n: count }),
    detail: t("move.stock.detail"),
    href: "/reorder",
    penalty: Math.min(25, count * 4),
  };
}

/** Batch/expiry tracking is a per-product toggle any shop can turn on
 * (not only pharmacies), so this checks every shop, not just pharmacy
 * business types — matching RetailHome's own existing expiry banner. */
async function expiryMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const { data } = await admin.from("medicine_batches").select("id, quantity").eq("shop_id", shopId).lte("expiry_date", cutoff.toISOString().slice(0, 10)).gt("quantity", 0);
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return {
    id: "expiry",
    title: t("move.expiry.title", { n: count }),
    detail: t("move.expiry.detail"),
    href: "/pharmacy/expiry",
    penalty: Math.min(30, count * 6),
  };
}

async function membershipMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const { data } = await admin.from("memberships").select("id").eq("shop_id", shopId).eq("status", "active").lte("end_date", in7Days);
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return {
    id: "membership",
    title: t("move.membership.title", { n: count }),
    detail: t("move.membership.detail"),
    href: "/gym/members",
    penalty: Math.min(25, count * 5),
  };
}

async function followUpMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const today = todayIso();
  const { data } = await admin.from("prescriptions").select("id").eq("shop_id", shopId).lt("follow_up_date", today).not("follow_up_date", "is", null);
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return {
    id: "followup",
    title: t("move.followup.title", { n: count }),
    detail: t("move.followup.detail"),
    href: "/clinic/appointments",
    penalty: Math.min(25, count * 6),
  };
}

async function vehicleDocsMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const { data } = await admin.from("vehicles").select("rc_expiry, insurance_expiry, puc_expiry, fitness_expiry").eq("shop_id", shopId).eq("is_active", true);
  const cutoffDays = 30;
  let count = 0;
  for (const v of data ?? []) {
    for (const field of ["rc_expiry", "insurance_expiry", "puc_expiry", "fitness_expiry"] as const) {
      const date = v[field];
      if (date && Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) <= cutoffDays) count++;
    }
  }
  if (count === 0) return null;
  return {
    id: "vehicledocs",
    title: t("move.vehicledocs.title", { n: count }),
    detail: t("move.vehicledocs.detail"),
    href: "/transport/vehicles",
    penalty: Math.min(25, count * 5),
  };
}

async function serviceJobsMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const { data } = await admin
    .from("service_jobs")
    .select("id")
    .eq("shop_id", shopId)
    .in("status", ["received", "in_progress", "ready"])
    .lt("expected_date", todayIso())
    .not("expected_date", "is", null);
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return {
    id: "servicejobs",
    title: t("move.servicejobs.title", { n: count }),
    detail: t("move.servicejobs.detail"),
    href: "/service?status=all",
    penalty: Math.min(30, count * 8),
  };
}

async function rentalsMove(admin: Admin, shopId: string, t: T): Promise<Move | null> {
  const { data } = await admin.from("rentals").select("id, end_date").eq("shop_id", shopId).in("status", ["booked", "active"]);
  const now = Date.now();
  const count = (data ?? []).filter((r) => new Date(r.end_date).getTime() < now).length;
  if (count === 0) return null;
  return {
    id: "rentals",
    title: t("move.rentals.title", { n: count }),
    detail: t("move.rentals.detail"),
    href: "/rentals",
    penalty: Math.min(30, count * 7),
  };
}
