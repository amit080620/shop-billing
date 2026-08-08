"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

function currentFinancialYear() {
  const now = new Date();
  return now.getMonth() >= 3
    ? `${now.getFullYear()}-${String((now.getFullYear() + 1) % 100).padStart(2, "0")}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear() % 100).padStart(2, "0")}`;
}

// ─── Appointments ───────────────────────────────────────────────────────

export async function createClinicAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const patientName = formData.get("patientName");
  const patientPhone = formData.get("patientPhone");
  const reasonForVisit = formData.get("reasonForVisit");
  const appointmentDate = formData.get("appointmentDate");
  const appointmentTime = formData.get("appointmentTime");
  const doctorName = formData.get("doctorName");
  const notes = formData.get("notes");
  const patientId = formData.get("patientId");

  if (typeof patientName !== "string" || !patientName.trim()) return { error: "Enter the patient's name" };
  if (typeof patientPhone !== "string" || !patientPhone.trim()) return { error: "Enter a phone number" };
  if (typeof appointmentDate !== "string" || !appointmentDate) return { error: "Pick a date" };
  if (typeof appointmentTime !== "string" || !appointmentTime) return { error: "Pick a time" };

  const { error } = await admin.from("clinic_appointments").insert({
    shop_id: session.shopId,
    patient_id: typeof patientId === "string" && patientId ? patientId : null,
    patient_name: patientName.trim(),
    patient_phone: patientPhone.trim(),
    reason_for_visit: typeof reasonForVisit === "string" && reasonForVisit.trim() ? reasonForVisit.trim() : null,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    doctor_name: typeof doctorName === "string" && doctorName.trim() ? doctorName.trim() : null,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not create appointment", error);
    return { error: "Could not book appointment" };
  }

  revalidatePath("/clinic/appointments");
  return null;
}

export async function updateClinicAppointmentStatusAction(
  appointmentId: string,
  status: "booked" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show",
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("clinic_appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update appointment", error);
    return { error: "Could not update appointment" };
  }
  revalidatePath("/clinic/appointments");
  return {};
}

export async function deleteClinicAppointmentAction(appointmentId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("clinic_appointments").delete().eq("id", appointmentId).eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not delete appointment", error);
    return { error: "Could not delete appointment" };
  }
  revalidatePath("/clinic/appointments");
  return {};
}

// ─── Self-service booking (working hours + public link) ────────────────

export type WorkingHours = Record<string, { start: string; end: string }[]>;

export async function saveBookingSettingsAction(settings: {
  slotDurationMinutes: number;
  workingHours: WorkingHours;
  isPublicBookingEnabled: boolean;
  doctorName?: string;
  doctorQualifications?: string;
  unavailableDates?: string[];
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("booking_settings").upsert({
    shop_id: session.shopId,
    slot_duration_minutes: settings.slotDurationMinutes,
    working_hours: settings.workingHours,
    is_public_booking_enabled: settings.isPublicBookingEnabled,
    doctor_name: settings.doctorName || null,
    doctor_qualifications: settings.doctorQualifications || null,
    unavailable_dates: settings.unavailableDates ?? [],
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save booking settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/clinic/settings/booking");
  revalidatePath("/salon/settings/booking");
  return {};
}

/** No requireSession() here on purpose — this runs for an anonymous
 * patient/customer on the public booking link, identified only by the
 * shop's public_token, never by a staff login. */
export async function createPublicBookingAction(
  publicToken: string,
  input: { name: string; phone: string; date: string; time: string; reason: string },
): Promise<{ error?: string }> {
  const admin = createSupabaseAdminClient();

  if (!input.name.trim()) return { error: "Enter your name" };
  if (!input.phone.trim()) return { error: "Enter your phone number" };

  const { data: settings } = await admin
    .from("booking_settings")
    .select("shop_id, is_public_booking_enabled")
    .eq("public_token", publicToken)
    .maybeSingle();
  if (!settings || !settings.is_public_booking_enabled) return { error: "Booking is not available right now" };

  const { data: shop } = await admin.from("shops").select("business_type").eq("id", settings.shop_id).single();
  if (!shop) return { error: "Not found" };

  // Re-check the slot hasn't just been taken by someone else — best
  // effort (there's no unique constraint backing this, unlike the
  // restaurant table race fix, since a slot isn't a single row to lock)
  // but catches the common case of two people looking at the same page.
  const table = shop.business_type === "clinic" ? "clinic_appointments" : "appointments";
  const { data: existing } = await admin
    .from(table)
    .select("id")
    .eq("shop_id", settings.shop_id)
    .eq("appointment_date", input.date)
    .eq("appointment_time", input.time)
    .not("status", "in", "(cancelled,no_show)")
    .maybeSingle();
  if (existing) return { error: "That slot was just taken — please pick another." };

  // A "system" staff row isn't available for a public insert, so borrow
  // any staff member on this shop purely to satisfy the not-null
  // staff_id column — this booking is patient-originated, not staff work.
  const { data: anyStaff } = await admin.from("staff").select("id").eq("shop_id", settings.shop_id).limit(1).single();
  if (!anyStaff) return { error: "Booking is not available right now" };

  if (shop.business_type === "clinic") {
    const { error } = await admin.from("clinic_appointments").insert({
      shop_id: settings.shop_id,
      patient_name: input.name.trim(),
      patient_phone: input.phone.trim(),
      reason_for_visit: input.reason.trim() || null,
      appointment_date: input.date,
      appointment_time: input.time,
      status: "booked",
      staff_id: anyStaff.id,
    });
    if (error) {
      console.error("Could not create public clinic booking", error);
      return { error: "Could not book — please try again" };
    }
  } else {
    const { error } = await admin.from("appointments").insert({
      shop_id: settings.shop_id,
      customer_name: input.name.trim(),
      customer_phone: input.phone.trim(),
      service_name: input.reason.trim() || "Appointment",
      appointment_date: input.date,
      appointment_time: input.time,
      status: "booked",
      staff_id: anyStaff.id,
    });
    if (error) {
      console.error("Could not create public salon booking", error);
      return { error: "Could not book — please try again" };
    }
  }

  return {};
}

// ─── Prescription settings (letterhead) ────────────────────────────────

export async function savePrescriptionSettingsAction(settings: {
  headerText: string;
  footerText: string;
  showShopLogo: boolean;
  customFieldLabels: string[];
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("prescription_settings").upsert({
    shop_id: session.shopId,
    header_text: settings.headerText || null,
    footer_text: settings.footerText || null,
    show_shop_logo: settings.showShopLogo,
    custom_field_labels: settings.customFieldLabels,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save prescription settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/clinic/settings");
  return {};
}

// ─── Prescriptions ──────────────────────────────────────────────────────

export type PrescriptionItemInput = {
  medicineName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  quantity?: number;
};

export async function createPrescriptionAction(input: {
  patientId: string | null;
  patientName: string;
  patientAge: string;
  patientGender: string;
  patientPhone: string;
  doctorName: string;
  customSections: { label: string; value: string }[];
  followUpDate: string | null;
  appointmentId: string | null;
  items: PrescriptionItemInput[];
}): Promise<{ error?: string; prescriptionId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.patientName.trim()) return { error: "Enter the patient's name" };

  const financialYear = currentFinancialYear();
  const { data: issuedNumber } = await admin.rpc("next_prescription_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  const prescriptionNumber = `${financialYear}/RX${String(issuedNumber ?? 0).padStart(5, "0")}`;

  const { data: prescription, error } = await admin
    .from("prescriptions")
    .insert({
      shop_id: session.shopId,
      prescription_number: prescriptionNumber,
      financial_year: financialYear,
      appointment_id: input.appointmentId,
      patient_id: input.patientId,
      patient_name: input.patientName.trim(),
      patient_age: input.patientAge || null,
      patient_gender: input.patientGender || null,
      patient_phone: input.patientPhone || null,
      doctor_name: input.doctorName || null,
      custom_sections: input.customSections.filter((s) => s.value.trim()),
      follow_up_date: input.followUpDate || null,
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !prescription) {
    console.error("Could not create prescription", error);
    return { error: "Could not save prescription" };
  }

  const items = input.items.filter((i) => i.medicineName.trim());
  if (items.length > 0) {
    const { error: itemsError } = await admin.from("prescription_items").insert(
      items.map((item, i) => ({
        prescription_id: prescription.id,
        medicine_name: item.medicineName.trim(),
        dosage: item.dosage?.trim() || null,
        frequency: item.frequency?.trim() || null,
        duration: item.duration?.trim() || null,
        instructions: item.instructions?.trim() || null,
        quantity: item.quantity ?? null,
        sort_order: i,
      })),
    );
    if (itemsError) console.error("Could not save prescription items", itemsError);
  }

  // If this patient came from a booked appointment, mark it completed —
  // writing the prescription is the natural end of that visit.
  if (input.appointmentId) {
    await admin.from("clinic_appointments").update({ status: "completed" }).eq("id", input.appointmentId).eq("shop_id", session.shopId);
  }

  revalidatePath("/clinic");
  return { prescriptionId: prescription.id };
}

/** Generates a real bill from a prescription's medicines — this is the
 * Clinic ↔ Pharmacy link: if the shop also runs a pharmacy (or a
 * pharmacy owner keeps a doctor on staff), prescribed medicines that
 * match the actual product catalog by name get billed at real
 * inventory prices and decrement real stock; anything not in the
 * catalog still bills as a manual line so nothing blocks the invoice. */
export async function generateBillFromPrescriptionAction(
  prescriptionId: string,
  paymentMethod: "cash" | "card" | "upi" | "online" | "other",
): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: prescription } = await admin
    .from("prescriptions")
    .select("id, patient_id, patient_name, bill_id")
    .eq("id", prescriptionId)
    .eq("shop_id", session.shopId)
    .single();
  if (!prescription) return { error: "Prescription not found" };
  if (prescription.bill_id) return { error: "A bill has already been generated for this prescription" };

  const { data: items } = await admin
    .from("prescription_items")
    .select("medicine_name, quantity")
    .eq("prescription_id", prescriptionId)
    .order("sort_order", { ascending: true });
  if (!items || items.length === 0) return { error: "No medicines on this prescription to bill" };

  const medicineNames = items.map((i) => i.medicine_name);
  const { data: matchedProducts } = await admin
    .from("products")
    .select("id, name, price, gst_percent, hsn_code")
    .eq("shop_id", session.shopId)
    .in("name", medicineNames);
  const productByName = new Map((matchedProducts ?? []).map((p) => [p.name.toLowerCase(), p]));

  const { createBillCore } = await import("./bills");
  const result = await createBillCore(session, {
    customerId: prescription.patient_id,
    items: items.map((item) => {
      const match = productByName.get(item.medicine_name.toLowerCase());
      return {
        productId: match?.id ?? null,
        description: item.medicine_name,
        hsnCode: match?.hsn_code ?? null,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        unitPrice: match ? Number(match.price) : 0,
        gstPercent: match ? Number(match.gst_percent) : 0,
      };
    }),
    discountType: "flat",
    discountValue: 0,
    paidAmount: 0,
    paymentMethod,
  });
  if ("error" in result) return { error: result.error };

  await admin.from("prescriptions").update({ bill_id: result.billId }).eq("id", prescriptionId);

  revalidatePath("/clinic");
  return { billId: result.billId };
}
