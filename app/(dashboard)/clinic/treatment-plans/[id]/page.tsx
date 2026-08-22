import { notFound } from "next/navigation";
import { getTreatmentPlanAction } from "@/lib/actions/treatmentPlans";
import { TreatmentPlanDetailClient } from "./TreatmentPlanDetailClient";

export default async function TreatmentPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { plan, items } = await getTreatmentPlanAction(id);
  if (!plan) notFound();

  return <TreatmentPlanDetailClient plan={plan} items={items} />;
}
