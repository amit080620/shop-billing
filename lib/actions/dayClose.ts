"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logAuditEvent } from "../audit";
import { computeDailyMoney } from "../dailyMoney";
import { countedFromDenominations, dayCloseFigures, type Denominations } from "../dayClose";
import { dayClosesReady } from "../dayCloseData";
import { todayIso } from "../dateHelpers";

/** Closes one day's cash: saves the count against what the Daily summary says should be in the
 * drawer. The expected figure is worked out here from the day's own records — never taken from
 * the browser — so a count can't be made to "match" by editing the page. */
export async function closeDayAction(input: {
  date: string;
  branchId: string | null;
  openingCash: number;
  denominations: Denominations | null;
  countedCash: number;
  cashRemoved: number;
  note: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await dayClosesReady(admin))) return { error: "Closing the day needs a one-time database update — ask the owner to run migration 0044." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayIso()) return { error: "Pick today or an earlier day to close." };
  const opening = Number(input.openingCash);
  if (!Number.isFinite(opening) || opening < 0) return { error: "Enter the cash the drawer started the day with (0 if none)." };
  const counted = input.denominations ? countedFromDenominations(input.denominations) : Number(input.countedCash);
  if (!Number.isFinite(counted) || counted < 0) return { error: "Count the cash in the drawer first." };
  const removed = Number(input.cashRemoved) || 0;
  if (removed < 0 || removed > counted) return { error: "Cash taken out can't be more than the cash counted." };

  // Only a branch of this shop.
  let branchId: string | null = input.branchId || null;
  if (branchId) {
    const { data: branch } = await admin.from("branches").select("id").eq("id", branchId).eq("shop_id", session.shopId).maybeSingle();
    if (!branch) branchId = null;
  }

  const money = await computeDailyMoney(admin, session.shopId, input.date, branchId);
  const f = dayCloseFigures({ openingCash: opening, cashChange: money.net.cash, countedCash: counted, cashRemoved: removed });

  const { data: row, error } = await admin
    .from("day_closes")
    .insert({
      shop_id: session.shopId,
      branch_id: branchId,
      business_date: input.date,
      opening_cash: opening,
      cash_change: money.net.cash,
      expected_cash: f.expected,
      counted_cash: f.counted,
      difference: f.difference,
      cash_removed: f.removed,
      carry_forward: f.carryForward,
      denominations: input.denominations ?? null,
      note: input.note.trim().slice(0, 300) || null,
      closed_by: session.userId,
      closed_by_name: session.staffName,
    })
    .select("id")
    .single();
  if (error || !row) {
    if (error?.code === "23505") return { error: "This day is already closed. The owner can reopen it to count again." };
    console.error("Could not close the day", error);
    return { error: "Could not save — try again." };
  }

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "day_closed",
    entityType: "day_close",
    entityId: row.id,
    details: { date: input.date, expected: f.expected, counted: f.counted, difference: f.difference, removed: f.removed },
  });
  revalidatePath("/daily-summary");
  return {};
}

/** Undoes a close so the day can be counted again — owner only, and written to the audit log. */
export async function reopenDayAction(closeId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("day_closes").select("id, business_date, counted_cash, difference").eq("id", closeId).eq("shop_id", session.shopId).maybeSingle();
  if (!row) return { error: "Not found" };
  const { error } = await admin.from("day_closes").delete().eq("id", closeId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not reopen — try again." };
  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "day_reopened",
    entityType: "day_close",
    entityId: closeId,
    details: { date: row.business_date, counted: Number(row.counted_cash), difference: Number(row.difference) },
  });
  revalidatePath("/daily-summary");
  return {};
}
