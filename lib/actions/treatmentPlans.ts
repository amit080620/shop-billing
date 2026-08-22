"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createBillCore } from "./bills";

export type TreatmentPlanItemInput = {
  toothNumber: string | null;
  procedureName: string;
  description: string | null;
  estimatedCost: number;
};

export async function createTreatmentPlanAction(input: {
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  doctorName: string | null;
  notes: string | null;
  items: TreatmentPlanItemInput[];
  dentalChart?: Record<string, string[]>;
}): Promise<{ planId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.patientName.trim()) return { error: "Enter the patient's name" };
  if (input.items.length === 0) return { error: "Add at least one treatment to the plan" };

  const { data: plan, error } = await admin
    .from("treatment_plans")
    .insert({
      shop_id: session.shopId,
      patient_id: input.patientId,
      patient_name: input.patientName.trim(),
      patient_phone: input.patientPhone,
      doctor_name: input.doctorName,
      notes: input.notes,
      status: "active",
      staff_id: session.userId,
      dental_chart: input.dentalChart && Object.keys(input.dentalChart).length > 0 ? input.dentalChart : null,
    })
    .select("id")
    .single();

  if (error || !plan) {
    console.error("Could not create treatment plan", error);
    return { error: "Could not save treatment plan" };
  }

  const { error: itemsError } = await admin.from("treatment_plan_items").insert(
    input.items.map((it, i) => ({
      treatment_plan_id: plan.id,
      tooth_number: it.toothNumber,
      procedure_name: it.procedureName,
      description: it.description,
      estimated_cost: it.estimatedCost,
      sort_order: i,
    })),
  );
  if (itemsError) {
    console.error("Could not save treatment plan items", itemsError);
    return { error: "Plan saved, but items could not be added" };
  }

  revalidatePath("/clinic/treatment-plans");
  return { planId: plan.id };
}

export async function listTreatmentPlansAction(): Promise<
  { id: string; patientName: string; doctorName: string | null; status: string; itemCount: number; totalEstimate: number; billId: string | null; createdAt: string }[]
> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: plans } = await admin
    .from("treatment_plans")
    .select("id, patient_name, doctor_name, status, bill_id, created_at, treatment_plan_items ( estimated_cost )")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false });

  return (plans ?? []).map((p) => {
    const items = Array.isArray(p.treatment_plan_items) ? p.treatment_plan_items : [];
    return {
      id: p.id,
      patientName: p.patient_name,
      doctorName: p.doctor_name,
      status: p.status,
      itemCount: items.length,
      totalEstimate: items.reduce((s: number, it: { estimated_cost: number }) => s + Number(it.estimated_cost), 0),
      billId: p.bill_id,
      createdAt: p.created_at,
    };
  });
}

export async function getTreatmentPlanAction(planId: string): Promise<{
  plan: {
    id: string;
    patientId: string | null;
    patientName: string;
    patientPhone: string | null;
    doctorName: string | null;
    notes: string | null;
    status: string;
    billId: string | null;
    dentalChart: Record<string, string[]> | null;
    createdAt: string;
  } | null;
  items: { id: string; toothNumber: string | null; procedureName: string; description: string | null; estimatedCost: number; status: string }[];
}> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: plan } = await admin
    .from("treatment_plans")
    .select("id, patient_id, patient_name, patient_phone, doctor_name, notes, status, bill_id, dental_chart, created_at")
    .eq("id", planId)
    .eq("shop_id", session.shopId)
    .single();

  if (!plan) return { plan: null, items: [] };

  const { data: items } = await admin
    .from("treatment_plan_items")
    .select("id, tooth_number, procedure_name, description, estimated_cost, status")
    .eq("treatment_plan_id", planId)
    .order("sort_order", { ascending: true });

  return {
    plan: {
      id: plan.id,
      patientId: plan.patient_id,
      patientName: plan.patient_name,
      patientPhone: plan.patient_phone,
      doctorName: plan.doctor_name,
      notes: plan.notes,
      status: plan.status,
      billId: plan.bill_id,
      dentalChart: (plan.dental_chart as Record<string, string[]> | null) ?? null,
      createdAt: plan.created_at,
    },
    items: (items ?? []).map((it) => ({
      id: it.id,
      toothNumber: it.tooth_number,
      procedureName: it.procedure_name,
      description: it.description,
      estimatedCost: Number(it.estimated_cost),
      status: it.status,
    })),
  };
}

/** Genuinely marks a treatment as done as the patient's visits
 * progress — a plan is rarely completed in a single sitting. */
export async function markTreatmentItemDoneAction(itemId: string, done: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  // Genuinely verify this item's plan belongs to this shop before
  // touching it — never trust a client-supplied ID on its own.
  const { data: item } = await admin
    .from("treatment_plan_items")
    .select("id, treatment_plan_id, treatment_plans!inner(shop_id)")
    .eq("id", itemId)
    .single();
  const plan = Array.isArray(item?.treatment_plans) ? item?.treatment_plans[0] : item?.treatment_plans;
  if (!item || plan?.shop_id !== session.shopId) return { error: "Item not found" };

  await admin
    .from("treatment_plan_items")
    .update({ status: done ? "completed" : "planned", completed_at: done ? new Date().toISOString() : null })
    .eq("id", itemId);

  revalidatePath("/clinic/treatment-plans");
  return {};
}

/** Genuinely the core of the whole workflow — turns a treatment
 * plan's items into a real bill by routing through createBillCore,
 * the exact same billing engine every other part of the app uses.
 * Never a separate/duplicate calculation path. */
export async function convertTreatmentPlanToBillAction(
  planId: string,
  paymentMethod: "cash" | "card" | "upi" | "online" | "other",
): Promise<{ billId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: plan } = await admin
    .from("treatment_plans")
    .select("id, patient_id, patient_name, bill_id")
    .eq("id", planId)
    .eq("shop_id", session.shopId)
    .single();
  if (!plan) return { error: "Treatment plan not found" };
  if (plan.bill_id) return { error: "This plan has already been billed" };

  const { data: items } = await admin
    .from("treatment_plan_items")
    .select("id, tooth_number, procedure_name, description, estimated_cost")
    .eq("treatment_plan_id", planId);

  if (!items || items.length === 0) return { error: "No treatments to bill" };

  const total = items.reduce((s, it) => s + Number(it.estimated_cost), 0);

  const result = await createBillCore(session, {
    customerId: plan.patient_id,
    items: items.map((it) => ({
      productId: null,
      description: it.tooth_number ? `${it.procedure_name} (Tooth ${it.tooth_number})` : it.procedure_name,
      hsnCode: null,
      quantity: 1,
      unitPrice: Number(it.estimated_cost),
      gstPercent: 0,
      stockQuantity: 0,
    })),
    discountType: "flat",
    discountValue: 0,
    paidAmount: total,
    paymentMethod,
  });

  if ("error" in result) return { error: result.error };

  await admin.from("treatment_plans").update({ status: "completed", bill_id: result.billId }).eq("id", planId);
  await admin.from("treatment_plan_items").update({ status: "billed" }).eq("treatment_plan_id", planId);

  revalidatePath("/clinic/treatment-plans");
  return { billId: result.billId };
}
