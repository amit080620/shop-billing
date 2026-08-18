import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { JobDetailClient } from "./JobDetailClient";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: job } = await admin
    .from("service_jobs")
    .select(
      "id, job_number, customer_name, customer_phone, item_description, device_category, identifiers, issue_description, status, technician_name, estimated_cost, final_cost, advance_paid, expected_date, created_at, ready_at, delivered_at, bill_id",
    )
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!job) {
    return <p className="text-sm text-muted">Job not found.</p>;
  }

  const { data: items } = await admin
    .from("service_job_items")
    .select("id, item_name, quantity, notes")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  return (
    <JobDetailClient
      lang={lang}
      job={{
        id: job.id,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        customerPhone: job.customer_phone,
        itemDescription: job.item_description,
        deviceCategory: job.device_category,
        identifiers: (job.identifiers as { label: string; value: string }[]) ?? [],
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
      items={(items ?? []).map((i) => ({ id: i.id, name: i.item_name, quantity: Number(i.quantity), notes: i.notes }))}
    />
  );
}
