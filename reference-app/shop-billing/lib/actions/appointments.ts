"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function createAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const customerName = formData.get("customerName");
  const customerPhone = formData.get("customerPhone");
  const serviceName = formData.get("serviceName");
  const stylistName = formData.get("stylistName");
  const appointmentDate = formData.get("appointmentDate");
  const appointmentTime = formData.get("appointmentTime");
  const notes = formData.get("notes");
  const customerId = formData.get("customerId");

  if (typeof customerName !== "string" || !customerName.trim()) return { error: "Enter the customer's name" };
  if (typeof customerPhone !== "string" || !customerPhone.trim()) return { error: "Enter a phone number" };
  if (typeof serviceName !== "string" || !serviceName.trim()) return { error: "Enter the service" };
  if (typeof appointmentDate !== "string" || !appointmentDate) return { error: "Pick a date" };
  if (typeof appointmentTime !== "string" || !appointmentTime) return { error: "Pick a time" };

  const { error } = await admin.from("appointments").insert({
    shop_id: session.shopId,
    customer_id: typeof customerId === "string" && customerId ? customerId : null,
    customer_name: customerName.trim(),
    customer_phone: customerPhone.trim(),
    service_name: serviceName.trim(),
    stylist_name: typeof stylistName === "string" && stylistName.trim() ? stylistName.trim() : null,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not create appointment", error);
    return { error: "Could not book appointment" };
  }

  revalidatePath("/salon/appointments");
  return null;
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show",
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update appointment", error);
    return { error: "Could not update appointment" };
  }
  revalidatePath("/salon/appointments");
  return {};
}

export async function deleteAppointmentAction(appointmentId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("appointments").delete().eq("id", appointmentId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete appointment", error);
    return { error: "Could not delete appointment" };
  }
  revalidatePath("/salon/appointments");
  return {};
}
