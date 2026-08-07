import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { JobDetailClient } from "./JobDetailClient";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: job } = await admin
    .from("service_jobs")
    .select("*")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!job) {
    return <p className="text-sm text-muted">Job not found.</p>;
  }

  return (
    <JobDetailClient
      job={{
        id: job.id,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        customerPhone: job.customer_phone,
        itemDescription: job.item_description,
        issueDescription: job.issue_description,
        status: job.status,
        technicianName: job.technician_name,
        estimatedCost: job.estimated_cost != null ? Number(job.estimated_cost) : null,
        finalCost: job.final_cost != null ? Number(job.final_cost) : null,
        advancePaid: Number(job.advance_paid),
        expectedDate: job.expected_date,
        createdAt: job.created_at,
        readyAt: job.ready_at,
        deliveredAt: job.delivered_at,
        billId: job.bill_id,
      }}
    />
  );
}
