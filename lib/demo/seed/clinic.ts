import {
  createClinicAppointmentAction,
  createPrescriptionAction,
  generateBillFromPrescriptionAction,
  saveBookingSettingsAction,
  saveMedicinesToLibraryAction,
  savePrescriptionSettingsAction,
  savePrescriptionTemplateAction,
  updateClinicAppointmentStatusAction,
} from "@/lib/actions/clinic";
import { convertTreatmentPlanToBillAction, createTreatmentPlanAction, markTreatmentItemDoneAction } from "@/lib/actions/treatmentPlans";
import { dateOffset, formData, isoAt } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, seedBills, seedPettyCash, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx, type SeededCustomer } from "./common";

const CLINIC: Catalog = [
  {
    category: "Consultation & Procedures",
    items: [
      { name: "Consultation - New Patient", price: 500, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
      { name: "Follow-up Consultation", price: 300, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
      { name: "ECG", price: 400, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
      { name: "Nebulisation", price: 200, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
      { name: "Wound Dressing", price: 150, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
      { name: "Injection Administration", price: 100, gst: 0, hsn: "9993", unit: "NOS", stock: 0 },
    ],
  },
  {
    category: "Medicines dispensed",
    items: [
      { name: "Paracetamol 500mg", price: 30, gst: 12, hsn: "3004", unit: "STRIP", stock: 120, low: 20 },
      { name: "Azithromycin 500mg", price: 120, gst: 12, hsn: "3004", unit: "STRIP", stock: 60, low: 10 },
      { name: "Cetirizine 10mg", price: 35, gst: 12, hsn: "3004", unit: "STRIP", stock: 80, low: 15 },
      { name: "Pantoprazole 40mg", price: 110, gst: 12, hsn: "3004", unit: "STRIP", stock: 60, low: 10 },
      { name: "ORS Sachet", price: 22, gst: 5, hsn: "3004", unit: "PKT", stock: 100, low: 20 },
      { name: "Multivitamin Capsule", price: 140, gst: 12, hsn: "3004", unit: "STRIP", stock: 50, low: 10 },
    ],
  },
];

const DOCTOR = "Dr. Rohan Mehta";

const VISITS: { complaint: string; diagnosis: string; advice: string; meds: { name: string; dosage: string; frequency: string; duration: string; instructions: string; qty: number }[]; vitals: Record<string, string | number> }[] = [
  {
    complaint: "Fever and body ache for 2 days",
    diagnosis: "Viral fever",
    advice: "Rest, plenty of fluids. Return if fever persists beyond 3 days.",
    meds: [
      { name: "Paracetamol 500mg", dosage: "500mg", frequency: "1-1-1", duration: "3 days", instructions: "After food", qty: 1 },
      { name: "ORS Sachet", dosage: "1 sachet", frequency: "Twice daily", duration: "3 days", instructions: "In 1 litre water", qty: 3 },
    ],
    vitals: { BP: "118/76", Pulse: 88, Temp: "101.2 F", Weight: 68 },
  },
  {
    complaint: "Cough, sore throat, cold",
    diagnosis: "Acute pharyngitis",
    advice: "Warm saline gargles. Avoid cold drinks.",
    meds: [
      { name: "Azithromycin 500mg", dosage: "500mg", frequency: "0-0-1", duration: "3 days", instructions: "After food", qty: 1 },
      { name: "Cetirizine 10mg", dosage: "10mg", frequency: "0-0-1", duration: "5 days", instructions: "At bedtime", qty: 1 },
    ],
    vitals: { BP: "122/80", Pulse: 82, Temp: "99.4 F", Weight: 72 },
  },
  {
    complaint: "Acidity and burning in the stomach",
    diagnosis: "Gastritis",
    advice: "Small frequent meals. Avoid spicy food and tea on an empty stomach.",
    meds: [{ name: "Pantoprazole 40mg", dosage: "40mg", frequency: "1-0-0", duration: "14 days", instructions: "Before breakfast", qty: 1 }],
    vitals: { BP: "126/84", Pulse: 78, Temp: "98.6 F", Weight: 75 },
  },
  {
    complaint: "Routine check-up, feeling tired",
    diagnosis: "Vitamin deficiency - advise blood tests",
    advice: "Sugar, thyroid and vitamin D tests. Review with reports.",
    meds: [{ name: "Multivitamin Capsule", dosage: "1 capsule", frequency: "0-1-0", duration: "30 days", instructions: "After lunch", qty: 1 }],
    vitals: { BP: "130/86", Pulse: 74, Temp: "98.4 F", Weight: 79 },
  },
];

export async function seedClinic(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, CLINIC);
  const patients = await insertCustomers(ctx, 30, { withGstin: 0, otherState: 0 });
  // Patient details a clinic keeps.
  for (const [i, p] of patients.entries()) {
    await ctx.admin.from("customers").update({ blood_group: ["A+", "B+", "O+", "AB+", "O-", "A-"][i % 6], known_allergies: i % 7 === 0 ? "Penicillin" : i % 11 === 0 ? "Dust, pollen" : null, gender: i % 2 === 0 ? "male" : "female" }).eq("id", p.id);
  }

  await savePrescriptionSettingsAction({
    headerText: `${DOCTOR}\nMBBS, MD (General Medicine)\nReg. No. GMC-45821 - Ahmedabad`,
    footerText: "Clinic hours: Mon-Sat 10:00-1:00 and 5:00-8:00. For emergencies call 90000 12345.",
    showShopLogo: false,
    customFieldLabels: ["Chief complaints", "Diagnosis", "Advice"],
    specialty: "general",
    rxShowPrice: false,
    rxShowManufacturer: false,
    rxShowComposition: false,
    rxShowPackSize: false,
    rxShowSideEffects: false,
    rxShowDrugInteractions: false,
    rxShowDescription: false,
  });
  const hours = [{ start: "10:00", end: "13:00" }, { start: "17:00", end: "20:00" }];
  await saveBookingSettingsAction({
    slotDurationMinutes: 15,
    workingHours: { mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: [hours[0]] },
    isPublicBookingEnabled: true,
    doctorName: DOCTOR,
    doctorQualifications: "MBBS, MD (General Medicine)",
    unavailableDates: [],
  });
  await saveMedicinesToLibraryAction([
    { name: "Paracetamol 500mg", composition: "Paracetamol 500mg", packSizeLabel: "10 tablets", medicineType: "Tablet" },
    { name: "Azithromycin 500mg", composition: "Azithromycin 500mg", packSizeLabel: "3 tablets", medicineType: "Tablet" },
    { name: "Cetirizine 10mg", composition: "Cetirizine 10mg", packSizeLabel: "10 tablets", medicineType: "Tablet" },
    { name: "Pantoprazole 40mg", composition: "Pantoprazole 40mg", packSizeLabel: "15 tablets", medicineType: "Tablet" },
    { name: "Amlodipine 5mg", composition: "Amlodipine 5mg", packSizeLabel: "15 tablets", medicineType: "Tablet" },
    { name: "Metformin 500mg", composition: "Metformin 500mg", packSizeLabel: "20 tablets", medicineType: "Tablet" },
  ]);
  await savePrescriptionTemplateAction({
    name: "Viral fever",
    chiefComplaint: "Fever and body ache",
    diagnosis: "Viral fever",
    advice: "Rest and fluids",
    customSections: [],
    medicines: [{ medicineName: "Paracetamol 500mg", dosage: "500mg", frequency: "1-1-1", duration: "3 days", instructions: "After food" }],
  });

  const byName = (n: string) => products.find((p) => p.name === n)!;
  const consult = byName("Consultation - New Patient");
  const follow = byName("Follow-up Consultation");

  // Appointment book: past visits (each ends in a prescription), today's list, next days.
  const book = async (dayOffset: number, time: string, patient: SeededCustomer, reason: string) => {
    await createClinicAppointmentAction(null, formData({ patientId: patient.id, patientName: patient.name, patientPhone: patient.phone, reasonForVisit: reason, appointmentDate: dateOffset(dayOffset), appointmentTime: time, doctorName: DOCTOR }));
    const { data } = await ctx.admin.from("clinic_appointments").select("id").eq("shop_id", ctx.shopId).order("created_at", { ascending: false }).limit(1);
    return data![0].id;
  };
  const rxIds: { id: string; daysAgo: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const daysAgo = Math.max(1, Math.round(((15 - i) / 15) ** 1.2 * 27) + 1);
    const patient = patients[i % patients.length];
    const visit = VISITS[i % VISITS.length];
    const apptId = await book(-daysAgo, ["10:15", "10:45", "11:30", "17:30", "18:15"][i % 5], patient, visit.complaint);
    const rx = await createPrescriptionAction({
      patientId: patient.id,
      patientName: patient.name,
      patientAge: String(24 + ((i * 7) % 45)),
      patientGender: i % 2 === 0 ? "Male" : "Female",
      patientPhone: patient.phone,
      doctorName: DOCTOR,
      customSections: [{ label: "Chief complaints", value: visit.complaint }, { label: "Diagnosis", value: visit.diagnosis }, { label: "Advice", value: visit.advice }],
      followUpDate: i % 3 === 0 ? dateOffset(-daysAgo + 7) : null,
      appointmentId: apptId,
      items: visit.meds.map((m) => ({ medicineName: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: m.instructions, quantity: m.qty })),
      vitals: visit.vitals,
    });
    if (rx.error || !rx.prescriptionId) throw new Error(`demo: prescription: ${rx.error}`);
    rxIds.push({ id: rx.prescriptionId, daysAgo });
    // Most visits are billed straight from the prescription (medicines dispensed at the clinic).
    if (i % 3 !== 2) {
      const billed = await generateBillFromPrescriptionAction(rx.prescriptionId, i % 2 === 0 ? "upi" : "cash");
      if (billed.billId) await ctx.admin.from("bills").update({ created_at: isoAt(daysAgo, 12, 30) }).eq("id", billed.billId);
    }
    await ctx.admin.from("prescriptions").update({ created_at: isoAt(daysAgo, 11, 0) }).eq("id", rx.prescriptionId);
    await ctx.admin.from("clinic_appointments").update({ created_at: isoAt(daysAgo + 2, 15, 0) }).eq("id", apptId);
  }

  // Consultation fees as ordinary bills too, so daily sales look like a real clinic's.
  await seedBills(ctx, [consult, follow, byName("ECG"), byName("Nebulisation"), byName("Wound Dressing")], patients, {
    count: 38,
    days: 30,
    itemsPerBill: [1, 2],
    qty: [1, 1],
    customerShare: 0.9,
    udhaarShare: 0.04,
    peakHours: [10, 11, 12, 17, 18, 19],
    decorate: (bill) => ({ ...bill, doctorName: DOCTOR }),
  });
  await seedUdhaarPayments(ctx, patients);

  // Today's schedule.
  const today: { time: string; patient: number; reason: string; status?: "arrived" | "completed" | "confirmed" | "booked" | "cancelled" | "no_show" }[] = [
    { time: "10:00", patient: 20, reason: "Follow-up - blood pressure", status: "completed" },
    { time: "10:15", patient: 21, reason: "Fever", status: "completed" },
    { time: "10:30", patient: 22, reason: "Cough and cold", status: "arrived" },
    { time: "10:45", patient: 23, reason: "Skin rash", status: "confirmed" },
    { time: "11:15", patient: 24, reason: "Knee pain", status: "confirmed" },
    { time: "17:30", patient: 25, reason: "Diabetes review", status: "booked" },
    { time: "18:00", patient: 26, reason: "Vaccination advice", status: "booked" },
  ];
  for (const a of today) {
    const id = await book(0, a.time, patients[a.patient], a.reason);
    if (a.status && a.status !== "booked") await updateClinicAppointmentStatusAction(id, a.status);
  }
  await book(1, "10:30", patients[27], "Follow-up after tests");
  await book(1, "17:15", patients[28], "Headache");
  await book(2, "11:00", patients[29], "General check-up");

  // A dental-style treatment plan turned into a bill, and one still open.
  const plan1 = await createTreatmentPlanAction({
    patientId: patients[3].id,
    patientName: patients[3].name,
    patientPhone: patients[3].phone,
    doctorName: DOCTOR,
    notes: "Physiotherapy course - 6 sessions",
    items: [
      { toothNumber: null, procedureName: "Physiotherapy session", description: "Neck and shoulder", estimatedCost: 600 },
      { toothNumber: null, procedureName: "Physiotherapy session", description: "Neck and shoulder", estimatedCost: 600 },
      { toothNumber: null, procedureName: "Review consultation", description: null, estimatedCost: 300 },
    ],
  });
  if (plan1.planId) {
    const { data: items } = await ctx.admin.from("treatment_plan_items").select("id").eq("treatment_plan_id", plan1.planId);
    for (const it of items ?? []) await markTreatmentItemDoneAction(it.id, true);
    const billed = await convertTreatmentPlanToBillAction(plan1.planId, "upi");
    if (billed.billId) await ctx.admin.from("bills").update({ created_at: isoAt(3, 13) }).eq("id", billed.billId);
  }
  await createTreatmentPlanAction({
    patientId: patients[5].id,
    patientName: patients[5].name,
    patientPhone: patients[5].phone,
    doctorName: DOCTOR,
    notes: "Wound care and follow-up",
    items: [
      { toothNumber: null, procedureName: "Wound dressing", description: "Left leg", estimatedCost: 150 },
      { toothNumber: null, procedureName: "Suture removal", description: null, estimatedCost: 250 },
      { toothNumber: null, procedureName: "Antibiotic course review", description: null, estimatedCost: 300 },
    ],
  });

  await seedPettyCash(ctx, [{ description: "Disposable gloves and syringes", amount: 1150, category: "Medical supplies", daysAgo: 5 }, { description: "Biomedical waste pickup", amount: 600, category: "Compliance", daysAgo: 9 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
