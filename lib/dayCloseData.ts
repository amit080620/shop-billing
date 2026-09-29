import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0044 (day_closes) has been applied. Until it has, the Daily summary simply
 * doesn't offer closing the day. */
export async function dayClosesReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("day_closes").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

export type DayCloseRow = {
  id: string;
  businessDate: string;
  openingCash: number;
  cashChange: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  cashRemoved: number;
  carryForward: number;
  note: string | null;
  closedByName: string | null;
  closedAt: string;
};

type Raw = { id: string; business_date: string; opening_cash: number; cash_change: number; expected_cash: number; counted_cash: number; difference: number; cash_removed: number; carry_forward: number; note: string | null; closed_by_name: string | null; closed_at: string };

const toRow = (r: Raw): DayCloseRow => ({
  id: r.id,
  businessDate: r.business_date,
  openingCash: Number(r.opening_cash),
  cashChange: Number(r.cash_change),
  expectedCash: Number(r.expected_cash),
  countedCash: Number(r.counted_cash),
  difference: Number(r.difference),
  cashRemoved: Number(r.cash_removed),
  carryForward: Number(r.carry_forward),
  note: r.note,
  closedByName: r.closed_by_name,
  closedAt: r.closed_at,
});

/** For one day: its close (if done), the opening cash to suggest (what the last closed day left
 * in the drawer), and the last few closes with their shortages and excesses. */
export async function loadDayClose(admin: Admin, shopId: string, date: string, branchId: string | null) {
  if (!(await dayClosesReady(admin))) return null;
  const cols = "id, business_date, opening_cash, cash_change, expected_cash, counted_cash, difference, cash_removed, carry_forward, note, closed_by_name, closed_at";
  const scoped = <T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(q: T) => (branchId ? q.eq("branch_id", branchId) : q.is("branch_id", null));
  const [{ data: today }, { data: previous }, { data: recent }] = await Promise.all([
    scoped(admin.from("day_closes").select(cols).eq("shop_id", shopId).eq("business_date", date)).maybeSingle(),
    scoped(admin.from("day_closes").select("carry_forward, business_date").eq("shop_id", shopId).lt("business_date", date)).order("business_date", { ascending: false }).limit(1).maybeSingle(),
    scoped(admin.from("day_closes").select(cols).eq("shop_id", shopId)).order("business_date", { ascending: false }).limit(7),
  ]);
  return {
    close: today ? toRow(today as Raw) : null,
    suggestedOpening: previous ? Number(previous.carry_forward) : 0,
    suggestedFrom: previous?.business_date ?? null,
    recent: ((recent ?? []) as Raw[]).map(toRow),
  };
}
