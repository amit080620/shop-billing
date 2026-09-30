"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { normalizePhone } from "../phone";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const grams = (v: unknown) => Math.round(Number(v) * 1000) / 1000;

async function guard() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "karigar_jobs")) return { error: moduleLockMessage("karigar_jobs") } as const;
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY } as const;
  return { session, admin } as const;
}

/** Metal handed to a karigar for a piece: how much, what purity, the wastage agreed and when it is due. */
export async function issueToKarigarAction(input: {
  karigarName: string;
  karigarPhone: string;
  item: string;
  metal: "gold" | "silver";
  purityPercent: number;
  issuedWeight: number;
  wastagePercent: number;
  makingCharge: number;
  dueDate: string;
  notes: string;
}): Promise<{ error?: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { session, admin } = g;
  const name = text(input.karigarName, 80);
  const item = text(input.item, 160);
  const weight = grams(input.issuedWeight);
  const purity = Number(input.purityPercent);
  const wastage = Number(input.wastagePercent) || 0;
  if (!name) return { error: "Write the karigar's name." };
  if (!item) return { error: "What is being made?" };
  if (!(weight > 0) || weight > 100_000) return { error: "Enter the weight given, in grams." };
  if (!(purity > 0 && purity <= 100)) return { error: "Purity is a percent, like 91.6." };
  if (wastage < 0 || wastage > 30) return { error: "Wastage is a percent between 0 and 30." };
  const { error } = await admin.from("karigar_jobs").insert({
    shop_id: session.shopId,
    karigar_name: name,
    karigar_phone: input.karigarPhone ? normalizePhone(input.karigarPhone) || null : null,
    item_description: item,
    metal_type: input.metal === "silver" ? "silver" : "gold",
    purity_percent: purity,
    issued_weight: weight,
    wastage_allowed_percent: wastage,
    making_charge: Math.max(0, Math.round(Number(input.makingCharge) || 0)),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null,
    notes: text(input.notes, 300),
    staff_id: session.userId,
  });
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/jewellery/karigar");
  return {};
}

/** The piece came back: its weight, any leftover metal returned, and the making charge settled. */
export async function receiveFromKarigarAction(input: { id: string; receivedWeight: number; returnedMetal: number; makingCharge: number }): Promise<{ error?: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { session, admin } = g;
  const received = grams(input.receivedWeight);
  const returned = grams(input.returnedMetal) || 0;
  if (!(received > 0)) return { error: "Enter the weight of the piece received." };
  if (returned < 0) return { error: "Leftover metal can't be negative." };
  const { data: job } = await admin.from("karigar_jobs").select("id, status, issued_weight").eq("id", input.id).eq("shop_id", session.shopId).maybeSingle();
  if (!job) return { error: "Not found." };
  if (job.status !== "with_karigar") return { error: "This one is already closed." };
  if (received + returned > Number(job.issued_weight) * 1.5) return { error: "That is far more than was given — check the weights." };
  const { error } = await admin
    .from("karigar_jobs")
    .update({ status: "received", received_weight: received, returned_metal_weight: returned, making_charge: Math.max(0, Math.round(Number(input.makingCharge) || 0)), received_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "with_karigar");
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/jewellery/karigar");
  return {};
}

/** Given by mistake, or the whole metal came back unmade. */
export async function cancelKarigarJobAction(id: string): Promise<{ error?: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const { session, admin } = g;
  const { error } = await admin.from("karigar_jobs").update({ status: "cancelled" }).eq("id", id).eq("shop_id", session.shopId).eq("status", "with_karigar");
  if (error) return { error: "Could not save — try again." };
  revalidatePath("/jewellery/karigar");
  return {};
}
