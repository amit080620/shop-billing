"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";

export type ActionState = { error?: string } | null;

// ─── Membership plans (catalog) ────────────────────────────────────────

export async function createMembershipPlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const durationDays = Number(formData.get("durationDays"));
  const price = Number(formData.get("price"));
  const ptSessions = Number(formData.get("ptSessionsIncluded")) || 0;

  if (typeof name !== "string" || !name.trim()) return { error: "Enter a plan name" };
  if (!durationDays || durationDays <= 0) return { error: "Enter a valid duration in days" };
  if (!price || price < 0) return { error: "Enter a valid price" };

  const { error } = await admin.from("membership_plans").insert({
    shop_id: session.shopId,
    name: name.trim(),
    duration_days: durationDays,
    price,
    pt_sessions_included: ptSessions,
  });
  if (error) {
    console.error("Could not create membership plan", error);
    return { error: "Could not create plan" };
  }
  revalidatePath("/gym/plans");
  return null;
}

export async function togglePlanActiveAction(planId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("membership_plans").update({ is_active: isActive }).eq("id", planId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update plan" };
  revalidatePath("/gym/plans");
  return {};
}

export async function deletePlanAction(planId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("membership_plans").delete().eq("id", planId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete plan" };
  revalidatePath("/gym/plans");
  return {};
}

// ─── Memberships (a member's actual subscription) ──────────────────────

/** Selling a membership bills through the same GST engine as everything
 * else — a membership is a real taxable sale, same as any product. */
export async function sellMembershipAction(input: {
  memberId: string | null;
  memberName: string;
  memberPhone: string;
  planId: string | null;
  planName: string;
  durationDays: number;
  price: number;
  ptSessionsIncluded: number;
  paymentMethod: "cash" | "card" | "upi" | "online" | "other";
  paidAmount: number;
}): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.memberName.trim()) return { error: "Enter the member's name" };
  if (!input.memberPhone.trim()) return { error: "Enter a phone number" };
  if (!input.planName.trim() || input.durationDays <= 0) return { error: "Pick a plan" };

  let memberId = input.memberId;
  if (!memberId) {
    const { data: existing } = await admin.from("customers").select("id").eq("shop_id", session.shopId).eq("phone", input.memberPhone.trim()).maybeSingle();
    if (existing) {
      memberId = existing.id;
    } else {
      const { data: newMember, error: memberError } = await admin
        .from("customers")
        .insert({ shop_id: session.shopId, name: input.memberName.trim(), phone: input.memberPhone.trim() })
        .select("id")
        .single();
      if (memberError || !newMember) return { error: "Could not create member record" };
      memberId = newMember.id;
    }
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + input.durationDays);
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { createBillCore } = await import("./bills");
  const billResult = await createBillCore(session, {
    customerId: memberId,
    items: [
      {
        productId: null,
        description: `Membership — ${input.planName}`,
        hsnCode: null,
        quantity: 1,
        unitPrice: round2(input.price),
        gstPercent: 18, // gym memberships/fitness services are taxed at 18% GST under Indian law
      },
    ],
    discountType: "flat",
    discountValue: 0,
    paidAmount: input.paidAmount,
    paymentMethod: input.paymentMethod,
  });
  if ("error" in billResult) return { error: billResult.error };

  const { error: membershipError } = await admin.from("memberships").insert({
    shop_id: session.shopId,
    member_id: memberId,
    plan_id: input.planId,
    plan_name: input.planName,
    start_date: toIso(startDate),
    end_date: toIso(endDate),
    pt_sessions_total: input.ptSessionsIncluded,
    bill_id: billResult.billId,
    staff_id: session.userId,
  });
  if (membershipError) {
    console.error("Could not create membership record", membershipError);
    return { error: "Bill was created, but the membership record failed — please contact support." };
  }

  revalidatePath("/gym");
  return { billId: billResult.billId };
}

export async function freezeMembershipAction(membershipId: string, freezeDays: number): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: membership } = await admin.from("memberships").select("end_date, status").eq("id", membershipId).eq("shop_id", session.shopId).single();
  if (!membership) return { error: "Membership not found" };
  if (membership.status !== "active") return { error: "Only an active membership can be frozen" };
  if (!freezeDays || freezeDays <= 0) return { error: "Enter how many days to freeze" };

  const newEndDate = new Date(membership.end_date);
  newEndDate.setDate(newEndDate.getDate() + freezeDays);
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const { error } = await admin
    .from("memberships")
    .update({ end_date: toIso(newEndDate), frozen_days_used: freezeDays })
    .eq("id", membershipId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not freeze membership" };
  revalidatePath("/gym");
  return {};
}

export async function cancelMembershipAction(membershipId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("memberships").update({ status: "cancelled" }).eq("id", membershipId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not cancel membership" };
  revalidatePath("/gym");
  return {};
}

export async function recordPtSessionAction(membershipId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: membership } = await admin.from("memberships").select("pt_sessions_total, pt_sessions_used").eq("id", membershipId).eq("shop_id", session.shopId).single();
  if (!membership) return { error: "Membership not found" };
  if (membership.pt_sessions_used >= membership.pt_sessions_total) return { error: "No PT sessions remaining" };

  const { error } = await admin.from("memberships").update({ pt_sessions_used: membership.pt_sessions_used + 1 }).eq("id", membershipId);
  if (error) return { error: "Could not record session" };
  revalidatePath("/gym");
  return {};
}

// ─── Trainer assignment ─────────────────────────────────────────────────

export async function assignTrainerAction(memberId: string, trainerId: string | null): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("customers").update({ assigned_trainer_id: trainerId }).eq("id", memberId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not assign trainer" };
  revalidatePath("/gym");
  return {};
}

// ─── Attendance / check-in ───────────────────────────────────────────────

export async function checkInMemberAction(memberId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: member } = await admin.from("customers").select("id").eq("id", memberId).eq("shop_id", session.shopId).single();
  if (!member) return { error: "Member not found" };

  const { error } = await admin.from("gym_attendance").insert({ shop_id: session.shopId, member_id: memberId });
  if (error) {
    if (error.code === "23505") return { error: "Already checked in — check them out first" };
    console.error("Could not check in member", error);
    return { error: "Could not check in" };
  }
  revalidatePath("/gym/attendance");
  return {};
}

export async function checkOutMemberAction(attendanceId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("gym_attendance").update({ checked_out_at: new Date().toISOString() }).eq("id", attendanceId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not check out" };
  revalidatePath("/gym/attendance");
  return {};
}
