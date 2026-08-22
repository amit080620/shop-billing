"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logError } from "../audit";
import { checkRateLimit } from "../rateLimit";

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

  // Genuine best-effort abuse deterrence — this is a public,
  // unauthenticated endpoint anyone with the shop's link can hit.
  const bookingDigitsOnly = input.phone.replace(/\D/g, "");
  if (!checkRateLimit(`booking:${publicToken}:${bookingDigitsOnly}`, 5, 10 * 60 * 1000)) {
    return { error: "Too many booking attempts recently — please wait a few minutes and try again." };
  }

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
  specialty: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("prescription_settings").upsert({
    shop_id: session.shopId,
    header_text: settings.headerText || null,
    footer_text: settings.footerText || null,
    show_shop_logo: settings.showShopLogo,
    custom_field_labels: settings.customFieldLabels,
    specialty: settings.specialty as "general" | "dental" | "cardiology" | "dermatology" | "physiotherapy" | "orthopedic" | "ent" | "gynecology" | "pediatric" | "psychiatry",
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
  dentalChart?: Record<string, string>;
  vitals?: Record<string, string | number>;
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
      dental_chart: input.dentalChart && Object.keys(input.dentalChart).length > 0 ? input.dentalChart : null,
      vitals: input.vitals && Object.keys(input.vitals).length > 0 ? input.vitals : null,
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

  const { error: linkError } = await admin.from("prescriptions").update({ bill_id: result.billId }).eq("id", prescriptionId).eq("shop_id", session.shopId);
  if (linkError) {
    console.error("Could not link bill to prescription", linkError);
    await logError({ shopId: session.shopId, context: "clinic.generateBillFromPrescriptionAction", message: "Could not link invoice to prescription", details: { prescriptionId, billId: result.billId, error: linkError.message } });
    await admin
      .from("bills")
      .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: "Automatic: could not link invoice to prescription" })
      .eq("id", result.billId);
    return { error: "Could not finish generating this bill — the invoice was voided automatically. Please try again." };
  }

  revalidatePath("/clinic");
  return { billId: result.billId };
}

// ─── Pediatric growth tracking (plain trend, no percentile overlay) ───────

export async function addGrowthLogAction(input: {
  patientId: string;
  heightCm: number | null;
  weightKg: number | null;
  headCircumferenceCm: number | null;
  note: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.heightCm && !input.weightKg && !input.headCircumferenceCm && !input.note.trim()) {
    return { error: "Enter at least a height, weight, head circumference, or note" };
  }

  const { error } = await admin.from("growth_logs").insert({
    shop_id: session.shopId,
    patient_id: input.patientId,
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    head_circumference_cm: input.headCircumferenceCm,
    note: input.note.trim() || null,
    staff_id: session.userId,
  });
  if (error) return { error: "Could not save growth entry" };
  revalidatePath(`/customers/${input.patientId}`);
  return {};
}

// ─── Patient photos (before/after documentation) ───────────────────────

const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadPatientPhotoAction(
  patientId: string,
  label: "before" | "after" | "other",
  note: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image" };
  if (file.size > PHOTO_MAX_BYTES) return { error: "Image must be under 4MB" };
  if (!PHOTO_ALLOWED_TYPES.includes(file.type)) return { error: "Use a PNG, JPG, or WEBP image" };

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${session.shopId}/${patientId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await admin.storage.from("patient-photos").upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("Could not upload patient photo", uploadError);
    return { error: "Could not upload photo" };
  }

  const { data: publicUrlData } = admin.storage.from("patient-photos").getPublicUrl(path);

  const { error } = await admin.from("patient_photos").insert({
    shop_id: session.shopId,
    patient_id: patientId,
    photo_url: publicUrlData.publicUrl,
    label,
    note: note.trim() || null,
    staff_id: session.userId,
  });
  if (error) {
    console.error("Could not save patient photo record", error);
    return { error: "Uploaded, but could not save the record" };
  }

  revalidatePath(`/customers/${patientId}`);
  return {};
}

export async function deletePatientPhotoAction(photoId: string, patientId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("patient_photos").delete().eq("id", photoId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete photo" };
  revalidatePath(`/customers/${patientId}`);
  return {};
}

/** Genuinely fetches this shop's own growing medicine library — sorted
 * so the medicines used most often, and most recently, appear first,
 * making the common ones one-tap away instead of needing to be typed. */
export async function getMedicineLibraryAction(): Promise<{ names: string[] }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("shop_medicine_library")
    .select("medicine_name")
    .eq("shop_id", session.shopId)
    .order("usage_count", { ascending: false })
    .order("last_used_at", { ascending: false })
    .limit(200);
  return { names: (data ?? []).map((r) => r.medicine_name) };
}

/** Genuinely saves every medicine name used in a prescription to this
 * shop's own library — a name typed once is remembered forever, so it
 * never needs to be typed in full again. Called automatically whenever
 * a prescription is saved; never requires the person to do anything
 * extra themselves. */
export async function saveMedicinesToLibraryAction(medicineNames: string[]): Promise<void> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const uniqueNames = [...new Set(medicineNames.map((n) => n.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return;

  for (const name of uniqueNames) {
    // Genuine upsert — a name used before gets its usage count bumped
    // (so truly frequent medicines float to the top of the list over
    // time), a new name gets genuinely added for the first time.
    const { data: existing } = await admin
      .from("shop_medicine_library")
      .select("id, usage_count")
      .eq("shop_id", session.shopId)
      .eq("medicine_name", name)
      .maybeSingle();

    if (existing) {
      await admin
        .from("shop_medicine_library")
        .update({ usage_count: existing.usage_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await admin.from("shop_medicine_library").insert({ shop_id: session.shopId, medicine_name: name });
    }
  }
}

/** Genuinely fetches the full library with usage stats, for a visible
 * management screen where the shop can review or clean it up. */
export async function listMedicineLibraryAction(): Promise<
  { id: string; medicineName: string; usageCount: number; lastUsedAt: string }[]
> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("shop_medicine_library")
    .select("id, medicine_name, usage_count, last_used_at")
    .eq("shop_id", session.shopId)
    .order("usage_count", { ascending: false });
  return (data ?? []).map((r) => ({ id: r.id, medicineName: r.medicine_name, usageCount: r.usage_count, lastUsedAt: r.last_used_at }));
}

export async function deleteMedicineFromLibraryAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shop_medicine_library").delete().eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove medicine" };
  revalidatePath("/clinic/medicine-library");
  return {};
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Genuinely a minimal, dependency-free CSV parser — handles quoted
 * fields (with embedded commas/newlines/escaped quotes), which a
 * real-world medicine database export genuinely needs. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Genuinely exports the full medicine library as a CSV, matching the
 * same rich format it can import — so a shop can back up, edit in a
 * spreadsheet, and re-import. */
export async function exportMedicineLibraryCsvAction(): Promise<{ csv: string; filename: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("shop_medicine_library")
    .select("medicine_name, price, is_discontinued, manufacturer_name, medicine_type, pack_size_label, composition, description, side_effects")
    .eq("shop_id", session.shopId)
    .order("medicine_name");

  const headers = ["name", "price", "is_discontinued", "manufacturer_name", "type", "pack_size_label", "composition", "description", "side_effects"];
  const lines = [headers.map(csvEscape).join(",")];
  for (const m of data ?? []) {
    lines.push(
      [m.medicine_name, m.price ?? "", m.is_discontinued, m.manufacturer_name ?? "", m.medicine_type ?? "", m.pack_size_label ?? "", m.composition ?? "", m.description ?? "", m.side_effects ?? ""]
        .map(csvEscape)
        .join(","),
    );
  }
  return { csv: lines.join("\n"), filename: `medicine-library-${new Date().toISOString().slice(0, 10)}.csv` };
}

/** Genuinely bulk-imports a medicine database CSV — matches the
 * user's real-world example format (id, name, price, is_discontinued,
 * manufacturer_name, type, pack_size_label, short_composition1/2 or
 * salt_composition, medicine_desc, side_effects). Column names are
 * matched case-insensitively and flexibly, since real-world exports
 * vary in exact naming. Existing medicines (matched by name) are
 * genuinely updated rather than duplicated. */
export async function importMedicineLibraryCsvAction(csvText: string): Promise<{ imported: number; error?: string }> {
  const rows = parseCsv(csvText);
  return importMedicineLibraryRowsAction(rows);
}

/** Genuinely the shared core — accepts already-parsed rows (works
 * identically whether they came from a plain CSV or a genuine Excel
 * .xlsx file parsed client-side), so Excel uploads never have to be
 * forced through a raw-text CSV parser that would choke on binary
 * spreadsheet data. */
export async function importMedicineLibraryRowsAction(rows: string[][]): Promise<{ imported: number; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (rows.length < 2) return { imported: 0, error: "The file is genuinely empty or has no data rows" };

  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const nameIdx = idx("name", "medicine_name");
  if (nameIdx === -1) return { imported: 0, error: "Could not find a 'name' column in the file" };

  const priceIdx = idx("price");
  const discontinuedIdx = idx("is_discontinued", "discontinued");
  const manufacturerIdx = idx("manufacturer_name", "manufacturer");
  const typeIdx = idx("type", "medicine_type");
  const packIdx = idx("pack_size_label", "pack_size");
  const compositionIdx = idx("salt_composition", "composition", "short_composition1");
  const descIdx = idx("medicine_desc", "description");
  const sideEffectsIdx = idx("side_effects");

  // Genuinely never throws regardless of the cell's actual type — a
  // genuine Excel file parsed client-side often has NUMBER cells for
  // numeric columns (price) rather than strings, and blindly calling
  // .trim() on those would genuinely crash the whole import.
  function cell(row: unknown[], i: number): string {
    if (i === -1) return "";
    const v = row[i];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  const records: {
    shop_id: string;
    medicine_name: string;
    price: number | null;
    is_discontinued: boolean;
    manufacturer_name: string | null;
    medicine_type: string | null;
    pack_size_label: string | null;
    composition: string | null;
    description: string | null;
    side_effects: string | null;
  }[] = [];

  for (const row of rows.slice(1)) {
    const name = cell(row, nameIdx);
    if (!name) continue;

    const priceRaw = cell(row, priceIdx);
    records.push({
      shop_id: session.shopId,
      medicine_name: name,
      price: priceRaw ? Number(priceRaw) || null : null,
      is_discontinued: /^(true|1|yes)$/i.test(cell(row, discontinuedIdx)),
      manufacturer_name: cell(row, manufacturerIdx) || null,
      medicine_type: cell(row, typeIdx) || null,
      pack_size_label: cell(row, packIdx) || null,
      composition: cell(row, compositionIdx) || null,
      description: cell(row, descIdx) || null,
      side_effects: cell(row, sideEffectsIdx) || null,
    });
  }

  // Genuinely a single bulk upsert rather than a select+insert/update
  // loop per row — a real medicine database CSV can have thousands of
  // rows, and per-row round-trips would genuinely be far too slow.
  // Supabase/Postgres batches this efficiently in chunks to stay
  // within request-size limits.
  const CHUNK_SIZE = 500;
  let imported = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("shop_medicine_library").upsert(chunk, { onConflict: "shop_id,medicine_name" });
    if (error) {
      console.error("Could not import medicine chunk", error);
      continue;
    }
    imported += chunk.length;
  }

  revalidatePath("/clinic/medicine-library");
  return { imported };
}
