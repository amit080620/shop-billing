"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** The shop asks the customer to approve the estimate: the job's link now shows Approve / Decline. */
export async function askEstimateApprovalAction(jobId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  if (!isId(jobId)) return { error: "Job not found." };
  const { data: job } = await admin.from("service_jobs").select("id, status, estimated_cost").eq("id", jobId).eq("shop_id", session.shopId).maybeSingle();
  if (!job) return { error: "Job not found." };
  if (!(Number(job.estimated_cost) > 0)) return { error: "Put the estimate on the job first." };
  if (job.status === "delivered" || job.status === "cancelled") return { error: "This job is closed." };
  const { error } = await admin.from("service_jobs").update({ estimate_status: "sent", estimate_responded_at: null, estimate_note: null }).eq("id", job.id);
  if (error) return { error: "Could not save — try again." };
  revalidatePath(`/service/${jobId}`);
  return {};
}

/** The customer's answer from the job link (no login — the link's id is the key, and it can
 * only answer an estimate that is waiting for one). */
export async function respondToEstimateAction(jobId: string, decision: "approved" | "declined", note: string): Promise<{ error?: string }> {
  const admin = createSupabaseAdminClient();
  if (!isId(jobId) || !(await gapsReady(admin))) return { error: "Not available." };
  if (decision !== "approved" && decision !== "declined") return { error: "Choose approve or decline." };
  const { data: job } = await admin.from("service_jobs").select("id, shop_id, status, estimate_status").eq("id", jobId).maybeSingle();
  if (!job || job.estimate_status !== "sent" || job.status === "delivered" || job.status === "cancelled") return { error: "This estimate is no longer waiting for an answer." };
  const { data: done, error } = await admin
    .from("service_jobs")
    .update({ estimate_status: decision, estimate_responded_at: new Date().toISOString(), estimate_note: (note ?? "").trim().slice(0, 300) || null })
    .eq("id", job.id)
    .eq("estimate_status", "sent")
    .select("id");
  if (error || !done?.length) return { error: "Could not save — try again." };
  revalidatePath(`/job-status/${jobId}`);
  revalidatePath(`/service/${jobId}`);
  revalidatePath("/service");
  return {};
}
