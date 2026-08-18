"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";
import { logError } from "../audit";

export type ActionState = { error?: string } | null;

function currentFinancialYear() {
  const now = new Date();
  return now.getMonth() >= 3
    ? `${now.getFullYear()}-${String((now.getFullYear() + 1) % 100).padStart(2, "0")}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear() % 100).padStart(2, "0")}`;
}

export async function createJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const customerName = formData.get("customerName");
  const customerPhone = formData.get("customerPhone");
  const itemsRaw = formData.get("items");
  const issueDescription = formData.get("issueDescription");
  const estimatedCost = formData.get("estimatedCost");
  const expectedDate = formData.get("expectedDate");
  const advancePaid = formData.get("advancePaid");
  const customerId = formData.get("customerId");
  const deviceCategory = formData.get("deviceCategory");
  const identifiersRaw = formData.get("identifiers");

  if (typeof customerName !== "string" || !customerName.trim()) return { error: "Enter the customer's name" };
  if (typeof customerPhone !== "string" || !customerPhone.trim()) return { error: "Enter a phone number" };

  let items: { name: string; quantity: number; notes?: string }[] = [];
  try {
    items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : [];
  } catch {
    items = [];
  }
  items = items.filter((i) => i.name?.trim());
  if (items.length === 0) return { error: "Add at least one item (e.g. Samsung phone, cracked screen)" };

  let identifiers: { label: string; value: string }[] = [];
  try {
    identifiers = typeof identifiersRaw === "string" ? JSON.parse(identifiersRaw) : [];
  } catch {
    identifiers = [];
  }
  identifiers = identifiers.filter((i) => i.label?.trim() && i.value?.trim());

  // A short, human-readable summary for everywhere else a job is shown
  // as a single line (job list, KDS-style cards, the eventual bill line
  // item) — the itemized breakdown itself lives in service_job_items.
  const itemDescription =
    items.length === 1
      ? items[0].name.trim()
      : `${items.length} items: ${items.map((i) => i.name.trim()).join(", ")}`;

  const financialYear = currentFinancialYear();
  const { data: issuedNumber } = await admin.rpc("next_job_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  const jobNumber = `${financialYear}/J${String(issuedNumber ?? 0).padStart(5, "0")}`;

  const { data: job, error } = await admin
    .from("service_jobs")
    .insert({
      shop_id: session.shopId,
      job_number: jobNumber,
      financial_year: financialYear,
      customer_id: typeof customerId === "string" && customerId ? customerId : null,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      item_description: itemDescription,
      device_category: typeof deviceCategory === "string" && deviceCategory ? deviceCategory : null,
      identifiers,
      issue_description: typeof issueDescription === "string" && issueDescription.trim() ? issueDescription.trim() : null,
      estimated_cost: estimatedCost ? Number(estimatedCost) : null,
      expected_date: typeof expectedDate === "string" && expectedDate ? expectedDate : null,
      advance_paid: advancePaid ? round2(Math.max(0, Number(advancePaid))) : 0,
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !job) {
    console.error("Could not create job", error);
    return { error: "Could not create job" };
  }

  const { error: itemsError } = await admin.from("service_job_items").insert(
    items.map((i) => ({
      job_id: job.id,
      item_name: i.name.trim(),
      quantity: i.quantity && i.quantity > 0 ? i.quantity : 1,
      notes: i.notes?.trim() || null,
    })),
  );
  if (itemsError) {
    // The job itself is already saved — losing the itemized breakdown is
    // a real gap for staff, but not a reason to fail the whole booking.
    console.error("Could not save job items", itemsError);
  }

  revalidatePath("/service");
  return null;
}

export async function updateJobStatusAction(
  jobId: string,
  status: "received" | "in_progress" | "ready" | "cancelled",
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const patch: { status: typeof status; ready_at?: string } = { status };
  if (status === "ready") patch.ready_at = new Date().toISOString();

  const { error } = await admin
    .from("service_jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update job status", error);
    return { error: "Could not update job status" };
  }
  revalidatePath("/service");
  revalidatePath(`/service/${jobId}`);
  return {};
}

export async function assignTechnicianAction(jobId: string, technicianName: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("service_jobs")
    .update({ technician_name: technicianName.trim() || null })
    .eq("id", jobId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not save" };
  revalidatePath(`/service/${jobId}`);
  return {};
}

/** Delivering a job is where money actually changes hands — this creates
 * a real bill (a "Service" line item at the final cost, GST included)
 * through the same billing engine every other vertical uses, so it shows
 * up correctly in Daily Summary, GSTR-1, and GSTR-3B like any other sale.
 * The advance already collected is treated as a partial payment against
 * that bill. */
export async function deliverJobAction(
  jobId: string,
  finalCost: number,
  gstPercent: number,
  additionalPayment: number,
  paymentMethod: "cash" | "card" | "upi" | "online" | "other",
): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!finalCost || finalCost <= 0) return { error: "Enter the final charge" };

  const { data: job } = await admin
    .from("service_jobs")
    .select("id, status, customer_id, customer_name, customer_phone, item_description, advance_paid, job_number")
    .eq("id", jobId)
    .eq("shop_id", session.shopId)
    .single();
  if (!job) return { error: "Job not found" };
  if (job.status === "delivered") return { error: "This job is already delivered" };

  const { createBillCore } = await import("./bills");
  const totalPaid = round2(Number(job.advance_paid) + Math.max(0, additionalPayment));
  const result = await createBillCore(session, {
    customerId: job.customer_id,
    items: [
      {
        productId: null,
        description: `${job.item_description} (Job #${job.job_number})`,
        hsnCode: null,
        quantity: 1,
        unitPrice: finalCost,
        gstPercent,
      },
    ],
    discountType: "flat",
    discountValue: 0,
    paidAmount: totalPaid,
    paymentMethod,
  });
  if ("error" in result) return { error: result.error };

  const { error: linkError } = await admin
    .from("service_jobs")
    .update({
      status: "delivered",
      final_cost: finalCost,
      delivered_at: new Date().toISOString(),
      bill_id: result.billId,
    })
    .eq("id", jobId)
    .eq("shop_id", session.shopId);
  if (linkError) {
    console.error("Could not link bill to service job", linkError);
    await logError({ shopId: session.shopId, context: "service.deliverJobAction", message: "Could not link invoice to service job", details: { jobId, billId: result.billId, error: linkError.message } });
    await admin
      .from("bills")
      .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: "Automatic: could not link invoice to service job" })
      .eq("id", result.billId);
    return { error: "Could not finish delivering this job — the invoice was voided automatically. Please try again." };
  }

  revalidatePath("/service");
  revalidatePath(`/service/${jobId}`);
  return { billId: result.billId };
}
