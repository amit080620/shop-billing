"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function createReservationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const customerName = formData.get("customerName");
  const customerPhone = formData.get("customerPhone");
  const partySize = formData.get("partySize");
  const reservationDate = formData.get("reservationDate");
  const reservationTime = formData.get("reservationTime");
  const tableId = formData.get("tableId");
  const tokenAmount = formData.get("tokenAmount");
  const notes = formData.get("notes");
  const customerId = formData.get("customerId");

  if (typeof customerName !== "string" || !customerName.trim()) return { error: "Enter the customer's name" };
  if (typeof customerPhone !== "string" || !customerPhone.trim()) return { error: "Enter a phone number" };
  if (typeof reservationDate !== "string" || !reservationDate) return { error: "Pick a date" };
  if (typeof reservationTime !== "string" || !reservationTime) return { error: "Pick a time" };

  const { error } = await admin.from("restaurant_reservations").insert({
    shop_id: session.shopId,
    customer_id: typeof customerId === "string" && customerId ? customerId : null,
    customer_name: customerName.trim(),
    customer_phone: customerPhone.trim(),
    party_size: partySize ? Math.max(1, Number(partySize)) : 2,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    table_id: typeof tableId === "string" && tableId ? tableId : null,
    token_amount: tokenAmount ? Math.max(0, Number(tokenAmount)) : 0,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not create reservation", error);
    return { error: "Could not book reservation" };
  }

  revalidatePath("/restaurant/reservations");
  revalidatePath("/restaurant");
  return null;
}

export async function updateReservationStatusAction(
  reservationId: string,
  status: "booked" | "confirmed" | "seated" | "cancelled" | "no_show",
  refund?: { refundType: "none" | "partial" | "full"; refundAmount: number },
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const updates: { status: typeof status; refund_type?: "none" | "partial" | "full"; refund_amount?: number } = { status };
  if ((status === "cancelled" || status === "no_show") && refund) {
    updates.refund_type = refund.refundType;
    updates.refund_amount = refund.refundAmount;
  }

  const { error } = await admin
    .from("restaurant_reservations")
    .update(updates)
    .eq("id", reservationId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update reservation", error);
    return { error: "Could not update reservation" };
  }
  revalidatePath("/restaurant/reservations");
  revalidatePath("/restaurant");
  return {};
}

export async function deleteReservationAction(reservationId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("restaurant_reservations").delete().eq("id", reservationId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete reservation", error);
    return { error: "Could not delete reservation" };
  }
  revalidatePath("/restaurant/reservations");
  revalidatePath("/restaurant");
  return {};
}
