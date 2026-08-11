import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { OrderDetailClient } from "./OrderDetailClient";

export default async function LabOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("lab_orders")
    .select("id, order_number, patient_name, patient_phone, patient_age, patient_gender, referring_doctor_name, collection_type, home_address, collection_slot, status, bill_id, staff:phlebotomist_id ( name )")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();
  if (!order) notFound();

  const { data: items } = await admin
    .from("lab_order_items")
    .select("id, test_name, reference_range, unit, result_value, result_flag, price")
    .eq("order_id", id)
    .order("test_name");

  const phlebotomist = Array.isArray(order.staff) ? order.staff[0] : (order.staff as { name: string } | null);

  return (
    <OrderDetailClient
      order={{
        id: order.id,
        orderNumber: order.order_number,
        patientName: order.patient_name,
        patientPhone: order.patient_phone,
        patientAge: order.patient_age,
        patientGender: order.patient_gender,
        referringDoctorName: order.referring_doctor_name,
        collectionType: order.collection_type,
        homeAddress: order.home_address,
        collectionSlot: order.collection_slot,
        status: order.status,
        billId: order.bill_id,
        phlebotomistName: phlebotomist?.name ?? null,
      }}
      items={(items ?? []).map((i) => ({
        id: i.id,
        testName: i.test_name,
        referenceRange: i.reference_range,
        unit: i.unit,
        resultValue: i.result_value,
        resultFlag: i.result_flag,
        price: Number(i.price),
      }))}
    />
  );
}
