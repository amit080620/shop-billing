"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";
import { logError } from "../audit";

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
    await logError({ shopId: session.shopId, context: "gym.sellMembershipAction", message: "Could not create membership record after billing", details: { billId: billResult.billId, error: membershipError.message } });
    // Void (not delete) the bill — a customer being charged with no
    // membership record to show for it is a real "took the money,
    // delivered nothing" bug. Voiding keeps the GST invoice number
    // sequence intact (no gap) and leaves a clear audit trail, while
    // still excluding it from revenue and reports like any voided bill.
    await admin
      .from("bills")
      .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: "Automatic: membership record failed to save" })
      .eq("id", billResult.billId);
    return { error: "Could not create the membership — the invoice was voided automatically, nothing was charged. Please try again." };
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

// ─── Workout Plans ────────────────────────────────────────────────────────

export type ExerciseInput = { muscleGroup: string; exerciseName: string; sets: number | null; reps: string; restSeconds: number | null };

export async function createWorkoutPlanAction(input: {
  memberId: string;
  title: string;
  notes: string;
  exercises: ExerciseInput[];
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.title.trim()) return { error: "Enter a plan title" };
  const validExercises = input.exercises.filter((e) => e.exerciseName.trim());
  if (validExercises.length === 0) return { error: "Add at least one exercise" };

  const { data: plan, error } = await admin
    .from("workout_plans")
    .insert({ shop_id: session.shopId, member_id: input.memberId, title: input.title.trim(), notes: input.notes.trim() || null, staff_id: session.userId })
    .select("id")
    .single();
  if (error || !plan) return { error: "Could not create workout plan" };

  await admin.from("workout_exercises").insert(
    validExercises.map((e, i) => ({
      plan_id: plan.id,
      muscle_group: e.muscleGroup || null,
      exercise_name: e.exerciseName.trim(),
      sets: e.sets,
      reps: e.reps || null,
      rest_seconds: e.restSeconds,
      sort_order: i,
    })),
  );

  revalidatePath("/gym/members");
  return {};
}

export async function deleteWorkoutPlanAction(planId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("workout_plans").delete().eq("id", planId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete plan" };
  revalidatePath("/gym/members");
  return {};
}

// ─── Diet Plans ───────────────────────────────────────────────────────────

export type MealInput = { mealSlot: "breakfast" | "mid_morning" | "lunch" | "evening" | "dinner" | "post_workout"; foodItems: string; calories: number | null };

export async function createDietPlanAction(input: {
  memberId: string;
  goal: string;
  notes: string;
  meals: MealInput[];
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const validMeals = input.meals.filter((m) => m.foodItems.trim());
  if (validMeals.length === 0) return { error: "Add at least one meal" };

  const { data: plan, error } = await admin
    .from("diet_plans")
    .insert({ shop_id: session.shopId, member_id: input.memberId, goal: input.goal || null, notes: input.notes.trim() || null, staff_id: session.userId })
    .select("id")
    .single();
  if (error || !plan) return { error: "Could not create diet plan" };

  await admin.from("diet_meals").insert(
    validMeals.map((m, i) => ({
      plan_id: plan.id,
      meal_slot: m.mealSlot,
      food_items: m.foodItems.trim(),
      calories: m.calories,
      sort_order: i,
    })),
  );

  revalidatePath("/gym/members");
  return {};
}

export async function deleteDietPlanAction(planId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("diet_plans").delete().eq("id", planId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete plan" };
  revalidatePath("/gym/members");
  return {};
}

// ─── Progress tracking ──────────────────────────────────────────────────

export async function addProgressLogAction(input: {
  memberId: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  note: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.weightKg && !input.bodyFatPercent && !input.note.trim()) return { error: "Enter at least a weight, body fat %, or note" };

  const { error } = await admin.from("progress_logs").insert({
    shop_id: session.shopId,
    member_id: input.memberId,
    weight_kg: input.weightKg,
    body_fat_percent: input.bodyFatPercent,
    note: input.note.trim() || null,
    staff_id: session.userId,
  });
  if (error) return { error: "Could not save progress entry" };
  revalidatePath("/gym/members");
  return {};
}

// ─── Simple leads tracker ──────────────────────────────────────────────

export async function createLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const phone = formData.get("phone");
  const source = formData.get("source");
  const interestedPlan = formData.get("interestedPlan");

  if (typeof name !== "string" || !name.trim()) return { error: "Enter the lead's name" };
  if (typeof phone !== "string" || !phone.trim()) return { error: "Enter a phone number" };

  const { error } = await admin.from("leads").insert({
    shop_id: session.shopId,
    name: name.trim(),
    phone: phone.trim(),
    source: typeof source === "string" && source ? source : null,
    interested_plan: typeof interestedPlan === "string" && interestedPlan.trim() ? interestedPlan.trim() : null,
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not create lead", error);
    return { error: "Could not save lead" };
  }
  revalidatePath("/gym/leads");
  return null;
}

export async function updateLeadStatusAction(leadId: string, status: "new" | "contacted" | "trial" | "converted" | "lost"): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("leads").update({ status }).eq("id", leadId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update lead" };
  revalidatePath("/gym/leads");
  return {};
}

export async function deleteLeadAction(leadId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("leads").delete().eq("id", leadId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete lead" };
  revalidatePath("/gym/leads");
  return {};
}

// ─── Simple class schedule ──────────────────────────────────────────────

export async function createClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const trainerId = formData.get("trainerId");
  const dayOfWeek = formData.get("dayOfWeek");
  const startTime = formData.get("startTime");
  const durationMinutes = formData.get("durationMinutes");
  const capacity = formData.get("capacity");

  if (typeof name !== "string" || !name.trim()) return { error: "Enter a class name" };
  if (dayOfWeek === null || typeof startTime !== "string" || !startTime) return { error: "Pick a day and time" };

  const { error } = await admin.from("gym_classes").insert({
    shop_id: session.shopId,
    name: name.trim(),
    trainer_id: typeof trainerId === "string" && trainerId ? trainerId : null,
    day_of_week: Number(dayOfWeek),
    start_time: startTime,
    duration_minutes: durationMinutes ? Number(durationMinutes) : 60,
    capacity: capacity ? Number(capacity) : 15,
  });
  if (error) {
    console.error("Could not create class", error);
    return { error: "Could not create class" };
  }
  revalidatePath("/gym/classes");
  return null;
}

export async function toggleClassActiveAction(classId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("gym_classes").update({ is_active: isActive }).eq("id", classId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update class" };
  revalidatePath("/gym/classes");
  return {};
}

export async function deleteClassAction(classId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("gym_classes").delete().eq("id", classId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete class" };
  revalidatePath("/gym/classes");
  return {};
}

export async function bookClassAction(classId: string, memberId: string, classDate: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: cls } = await admin.from("gym_classes").select("id, capacity").eq("id", classId).eq("shop_id", session.shopId).single();
  if (!cls) return { error: "Class not found" };

  const { count } = await admin.from("gym_class_bookings").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("class_date", classDate);
  if ((count ?? 0) >= cls.capacity) return { error: "This class is full" };

  const { error } = await admin.from("gym_class_bookings").insert({ class_id: classId, member_id: memberId, class_date: classDate });
  if (error) {
    if (error.code === "23505") return { error: "This member is already booked into this class" };
    return { error: "Could not book class" };
  }
  revalidatePath("/gym/classes");
  return {};
}

export async function cancelClassBookingAction(bookingId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: booking } = await admin
    .from("gym_class_bookings")
    .select("id, gym_classes!inner(shop_id)")
    .eq("id", bookingId)
    .single();
  if (!booking) return { error: "Booking not found" };
  const cls = Array.isArray(booking.gym_classes) ? booking.gym_classes[0] : booking.gym_classes;
  if (cls?.shop_id !== session.shopId) return { error: "Booking not found" };

  const { error } = await admin.from("gym_class_bookings").delete().eq("id", bookingId);
  if (error) return { error: "Could not cancel booking" };
  revalidatePath("/gym/classes");
  return {};
}

// ─── Self-service check-in kiosk ─────────────────────────────────────────

export async function saveKioskSettingsAction(isEnabled: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("gym_kiosk_settings")
    .upsert({ shop_id: session.shopId, is_enabled: isEnabled, updated_at: new Date().toISOString() }, { onConflict: "shop_id" });
  if (error) return { error: "Could not save kiosk settings" };
  revalidatePath("/gym/kiosk-settings");
  return {};
}

/** No auth — a member types their own phone number on a tablet left at
 * the entrance and checks themselves in. This is the whole point: it
 * removes staff from the loop entirely for routine daily check-ins. */
export async function publicKioskCheckInAction(
  token: string,
  phone: string,
): Promise<{ error?: string; memberName?: string; alreadyIn?: boolean }> {
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin.from("gym_kiosk_settings").select("shop_id, is_enabled").eq("public_token", token).maybeSingle();
  if (!settings || !settings.is_enabled) return { error: "Check-in is not available right now — please ask at the desk." };

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { error: "Enter your full 10-digit phone number" };
  const last10 = digits.slice(-10);

  const { data: member } = await admin.from("customers").select("id, name, phone").eq("shop_id", settings.shop_id).ilike("phone", `%${last10}`).maybeSingle();
  if (!member) return { error: "We couldn't find that number — please check with the desk to register." };

  const { data: alreadyOpen } = await admin
    .from("gym_attendance")
    .select("id")
    .eq("member_id", member.id)
    .is("checked_out_at", null)
    .maybeSingle();
  if (alreadyOpen) return { memberName: member.name, alreadyIn: true };

  const { error } = await admin.from("gym_attendance").insert({ shop_id: settings.shop_id, member_id: member.id });
  if (error) {
    if (error.code === "23505") return { memberName: member.name, alreadyIn: true };
    console.error("Kiosk check-in failed", error);
    return { error: "Could not check in — please try again or ask at the desk." };
  }

  return { memberName: member.name };
}
