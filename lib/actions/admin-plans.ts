"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../admin-auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { MODULES } from "../modules";
import { planFor, PLANS, type PlanKey } from "../plans";
import type { Database } from "../supabase/database.types";

export type ActionState = { error?: string; success?: boolean } | null;

const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

/** True once migration 0040 has been run: the plan column exists. Every
 * admin screen checks this so it can say "run the database update"
 * instead of failing with a cryptic column error. */
export async function plansMigrationApplied(): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("shops").select("plan").limit(1);
  return !error;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Jan 31 + 1 month lands in March; step back to the last day of February.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Puts a shop on a plan when payment arrives.
 *
 * Renewals stack: paying for 12 months on a plan with 40 days left ends 12
 * months after the CURRENT end date, not 12 months after today, so nobody
 * loses days by paying early. Changing to a different plan starts from
 * today. Every change is written to plan_changes and to the older
 * subscription history so the money trail stays in one place. */
export async function adminAssignPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const db = createSupabaseAdminClient();

  const shopId = formData.get("shopId");
  const plan = formData.get("plan");
  const monthsRaw = Number(formData.get("months") ?? 0);
  const explicitDate = formData.get("validUntil");
  const amount = Number(formData.get("amount")) || 0;
  const note = typeof formData.get("note") === "string" ? String(formData.get("note")).trim() : "";

  if (typeof shopId !== "string" || !shopId) return { error: "Missing shop" };
  if (typeof plan !== "string" || !PLAN_KEYS.includes(plan as PlanKey)) return { error: "Choose a plan" };
  if (!(await plansMigrationApplied())) {
    return { error: "Plans aren't switched on in the database yet — run migration 0040 in the Supabase SQL editor first." };
  }

  const { data: shop } = await db
    .from("shops")
    .select("plan, subscription_valid_until, wallet_balance")
    .eq("id", shopId)
    .single();
  if (!shop) return { error: "Shop not found" };

  const planKey = plan as PlanKey;
  const months = Number.isFinite(monthsRaw) ? Math.max(0, Math.min(60, Math.round(monthsRaw))) : 0;

  // Work out the new end date.
  let validUntil: string | null;
  if (planKey === "free") {
    validUntil = null; // Free never expires
  } else if (typeof explicitDate === "string" && explicitDate) {
    validUntil = explicitDate;
  } else if (months > 0) {
    const currentEnd = shop.subscription_valid_until ? new Date(shop.subscription_valid_until) : null;
    const sameActivePlan = shop.plan === planKey && !!currentEnd && currentEnd.getTime() > Date.now();
    validUntil = isoDate(addMonths(sameActivePlan ? currentEnd! : new Date(), months));
  } else {
    return { error: "Choose how long the plan runs, or pick an end date." };
  }

  const update: Database["public"]["Tables"]["shops"]["Update"] = {
    plan: planKey,
    plan_started_at: new Date().toISOString(),
    plan_note: note || null,
    subscription_valid_until: validUntil,
    wallet_balance: Number(shop.wallet_balance) + amount,
    // A shop that has been assigned a plan is past its trial.
    trial_ends_at: null,
  };

  if (planKey === "custom") {
    const chosen = formData.getAll("modules").map(String).filter((m) => MODULES.some((x) => x.key === m));
    const limits: Record<string, number> = {};
    for (const [field, key] of [
      ["limitBills", "billsPerMonth"],
      ["limitProducts", "products"],
      ["limitStaff", "staff"],
      ["limitBranches", "branches"],
    ] as const) {
      const raw = formData.get(field);
      if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return { error: "Limits must be whole numbers (leave blank for unlimited)" };
        limits[key] = Math.round(n);
      }
    }
    update.enabled_modules = chosen;
    update.plan_limits = limits;
    const price = Number(formData.get("planPrice"));
    update.plan_price = Number.isFinite(price) && price > 0 ? price : null;
  } else {
    // Named plans define their own modules and limits.
    update.enabled_modules = null;
    update.plan_limits = null;
    update.plan_price = null;
  }

  const { error } = await db.from("shops").update(update).eq("id", shopId);
  if (error) {
    console.error("Could not assign plan", error);
    return { error: "Could not save the plan" };
  }

  const label = `${planFor(planKey).name}${months > 0 ? ` — ${months} month${months === 1 ? "" : "s"}` : ""}`;
  await db.from("plan_changes").insert({
    shop_id: shopId,
    from_plan: shop.plan,
    to_plan: planKey,
    amount: amount || null,
    months: months || null,
    note: note || null,
    changed_by: admin.userId,
  });
  await db.from("subscription_transactions").insert({
    shop_id: shopId,
    amount,
    new_valid_until: validUntil,
    note: `Plan: ${label}${note ? ` · ${note}` : ""}`,
    created_by: admin.userId,
  });

  revalidatePath(`/admin/shops/${shopId}`);
  revalidatePath("/admin");
  return { success: true };
}

/** The owner's mobile, corrected or added by the admin (older shops never
 * gave one). */
export async function adminSetOwnerPhoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const db = createSupabaseAdminClient();
  const shopId = formData.get("shopId");
  const phone = String(formData.get("ownerPhone") ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (typeof shopId !== "string" || !shopId) return { error: "Missing shop" };
  if (phone && !/^[6-9]\d{9}$/.test(phone)) return { error: "Enter a 10-digit mobile number" };
  if (!(await plansMigrationApplied())) return { error: "Run migration 0040 first" };
  const { error } = await db.from("shops").update({ owner_phone: phone || null }).eq("id", shopId);
  if (error) return { error: "Could not save" };
  revalidatePath(`/admin/shops/${shopId}`);
  revalidatePath("/admin");
  return { success: true };
}

export async function adminSetEnquiryStatusAction(id: string, status: "new" | "contacted" | "won" | "lost"): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const db = createSupabaseAdminClient();
  const { error } = await db.from("sales_enquiries").update({ status }).eq("id", id);
  if (error) return { error: "Could not update" };
  revalidatePath("/admin/enquiries");
  return {};
}
