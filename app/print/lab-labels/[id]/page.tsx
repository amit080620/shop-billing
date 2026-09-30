import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { sampleLabels, SAMPLE_LABEL, type SampleType } from "@/lib/labSamples";
import { LabLabelsClient } from "./LabLabelsClient";

/** Stickers for the sample tubes and pots of one lab order: one per kind of sample, with a barcode. */
export default async function LabLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("lab_orders")
    .select("id, order_number, patient_name, patient_age, patient_gender, created_at")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!order) notFound();
  const { data: items } = await admin.from("lab_order_items").select("test_name, test_id").eq("order_id", id).order("test_name");
  const testIds = [...new Set((items ?? []).map((i) => i.test_id).filter((x): x is string => !!x))];
  const { data: tests } = testIds.length ? await admin.from("lab_tests").select("id, sample_type").in("id", testIds) : { data: [] };
  const typeOf = new Map((tests ?? []).map((x) => [x.id, x.sample_type as SampleType]));
  const labels = sampleLabels(
    order.order_number,
    (items ?? []).map((i) => ({ testName: i.test_name, sampleType: i.test_id ? (typeOf.get(i.test_id) ?? null) : null })),
  );
  const gender = order.patient_gender === "male" ? "M" : order.patient_gender === "female" ? "F" : order.patient_gender ? "O" : "";
  const when = new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <LabLabelsClient
      orderId={order.id}
      patient={`${order.patient_name}${order.patient_age || gender ? ` · ${[order.patient_age, gender].filter(Boolean).join("/")}` : ""}`}
      when={when}
      labels={labels.map((l) => ({ ...l, sampleName: t(SAMPLE_LABEL[l.sampleType]) }))}
      words={{
        title: t("Sample labels"),
        hint: t("One sticker per sample. Scan it on the Lab orders screen to open the order."),
        roll: t("Label roll 50 × 25 mm"),
        a4: t("A4 sheet"),
        copies: t("Copies"),
        print: t("Print labels"),
        back: t("← Back to the order"),
        none: t("This order has no tests yet."),
      }}
    />
  );
}
