import { billLabOrderAction, createLabOrderAction, createLabPackageAction, createLabTestAction, saveTestResultAction, updateLabOrderStatusAction } from "@/lib/actions/lab";
import { dateOffset, formData, isoAt, personName } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, seedBills, seedPettyCash, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx } from "./common";

// Things a lab also sells over the counter.
const COUNTER: Catalog = [
  {
    category: "Home testing & care",
    items: [
      { name: "Glucometer Strips (50)", price: 850, gst: 12, hsn: "3822", unit: "BOX", stock: 30, low: 6 },
      { name: "Digital Glucometer", price: 990, gst: 12, hsn: "9018", unit: "NOS", stock: 12, low: 3, warrantyMonths: 12 },
      { name: "Pregnancy Test Kit", price: 60, gst: 12, hsn: "3822", unit: "NOS", stock: 40, low: 10 },
      { name: "Digital Thermometer", price: 250, gst: 18, hsn: "9025", unit: "NOS", stock: 15, low: 4 },
      { name: "Surgical Mask (box of 50)", price: 180, gst: 5, hsn: "6307", unit: "BOX", stock: 25, low: 5 },
      { name: "Sample Collection Cups (25)", price: 120, gst: 12, hsn: "3926", unit: "PKT", stock: 3, low: 6 },
    ],
  },
];

type TestDef = { name: string; category: string; sample: "blood" | "urine" | "stool" | "swab"; price: number; gst: number; hours: number; range?: string; unit?: string };

const TESTS: TestDef[] = [
  { name: "Hemoglobin", category: "Hematology", sample: "blood", price: 120, gst: 0, hours: 6, range: "12 - 16", unit: "g/dL" },
  { name: "Total WBC Count", category: "Hematology", sample: "blood", price: 150, gst: 0, hours: 6, range: "4000 - 11000", unit: "/cu.mm" },
  { name: "Platelet Count", category: "Hematology", sample: "blood", price: 180, gst: 0, hours: 6, range: "150000 - 450000", unit: "/cu.mm" },
  { name: "ESR", category: "Hematology", sample: "blood", price: 100, gst: 0, hours: 6, range: "0 - 20", unit: "mm/hr" },
  { name: "Fasting Blood Sugar", category: "Diabetes", sample: "blood", price: 80, gst: 0, hours: 4, range: "70 - 100", unit: "mg/dL" },
  { name: "Post-Prandial Blood Sugar", category: "Diabetes", sample: "blood", price: 80, gst: 0, hours: 4, range: "70 - 140", unit: "mg/dL" },
  { name: "HbA1c", category: "Diabetes", sample: "blood", price: 450, gst: 0, hours: 12, range: "4 - 5.6", unit: "%" },
  { name: "Total Cholesterol", category: "Lipid", sample: "blood", price: 200, gst: 0, hours: 8, range: "125 - 200", unit: "mg/dL" },
  { name: "HDL Cholesterol", category: "Lipid", sample: "blood", price: 220, gst: 0, hours: 8, range: "40 - 60", unit: "mg/dL" },
  { name: "LDL Cholesterol", category: "Lipid", sample: "blood", price: 240, gst: 0, hours: 8, range: "0 - 100", unit: "mg/dL" },
  { name: "Triglycerides", category: "Lipid", sample: "blood", price: 220, gst: 0, hours: 8, range: "0 - 150", unit: "mg/dL" },
  { name: "TSH", category: "Thyroid", sample: "blood", price: 350, gst: 0, hours: 12, range: "0.4 - 4.0", unit: "uIU/mL" },
  { name: "Free T3", category: "Thyroid", sample: "blood", price: 380, gst: 0, hours: 12, range: "2.3 - 4.2", unit: "pg/mL" },
  { name: "Free T4", category: "Thyroid", sample: "blood", price: 380, gst: 0, hours: 12, range: "0.8 - 1.8", unit: "ng/dL" },
  { name: "Vitamin D (25-OH)", category: "Vitamins", sample: "blood", price: 1100, gst: 0, hours: 24, range: "30 - 100", unit: "ng/mL" },
  { name: "Vitamin B12", category: "Vitamins", sample: "blood", price: 900, gst: 0, hours: 24, range: "200 - 900", unit: "pg/mL" },
  { name: "Serum Creatinine", category: "Kidney", sample: "blood", price: 150, gst: 0, hours: 6, range: "0.6 - 1.2", unit: "mg/dL" },
  { name: "Blood Urea", category: "Kidney", sample: "blood", price: 150, gst: 0, hours: 6, range: "15 - 40", unit: "mg/dL" },
  { name: "Uric Acid", category: "Kidney", sample: "blood", price: 180, gst: 0, hours: 6, range: "3.5 - 7.2", unit: "mg/dL" },
  { name: "SGPT (ALT)", category: "Liver", sample: "blood", price: 180, gst: 0, hours: 8, range: "5 - 40", unit: "U/L" },
  { name: "SGOT (AST)", category: "Liver", sample: "blood", price: 180, gst: 0, hours: 8, range: "5 - 40", unit: "U/L" },
  { name: "Total Bilirubin", category: "Liver", sample: "blood", price: 160, gst: 0, hours: 8, range: "0.3 - 1.2", unit: "mg/dL" },
  { name: "CRP (C-Reactive Protein)", category: "Infection", sample: "blood", price: 500, gst: 0, hours: 12, range: "0 - 6", unit: "mg/L" },
  { name: "Dengue NS1 Antigen", category: "Infection", sample: "blood", price: 700, gst: 0, hours: 6 },
  { name: "Malaria Parasite (MP)", category: "Infection", sample: "blood", price: 250, gst: 0, hours: 4 },
  { name: "Widal Test", category: "Infection", sample: "blood", price: 300, gst: 0, hours: 6 },
  { name: "Urine Routine & Microscopy", category: "Urine", sample: "urine", price: 120, gst: 0, hours: 4 },
  { name: "Urine Culture", category: "Urine", sample: "urine", price: 600, gst: 0, hours: 48 },
  { name: "Stool Routine", category: "Stool", sample: "stool", price: 150, gst: 0, hours: 6 },
  { name: "COVID-19 RT-PCR", category: "Infection", sample: "swab", price: 500, gst: 0, hours: 24 },
];

const PACKAGES: { name: string; tests: string[] }[] = [
  { name: "Full Body Checkup", tests: ["Hemoglobin", "Total WBC Count", "Fasting Blood Sugar", "Total Cholesterol", "Serum Creatinine", "SGPT (ALT)", "TSH", "Urine Routine & Microscopy"] },
  { name: "Diabetes Profile", tests: ["Fasting Blood Sugar", "Post-Prandial Blood Sugar", "HbA1c"] },
  { name: "Lipid Profile", tests: ["Total Cholesterol", "HDL Cholesterol", "LDL Cholesterol", "Triglycerides"] },
  { name: "Thyroid Profile", tests: ["TSH", "Free T3", "Free T4"] },
  { name: "Fever Panel", tests: ["Total WBC Count", "Platelet Count", "Dengue NS1 Antigen", "Malaria Parasite (MP)", "Widal Test"] },
];

const DOCTORS = ["Dr. S. Kulkarni", "Dr. A. Patel", "Dr. R. Menon", "Dr. P. Shah", "Self"];

export async function seedLab(ctx: SeedCtx): Promise<void> {
  for (const t of TESTS) {
    await createLabTestAction(null, formData({ name: t.name, category: t.category, sampleType: t.sample, price: t.price, gstPercent: t.gst, turnaroundHours: t.hours, referenceRange: t.range, unit: t.unit }));
  }
  const { data: tests } = await ctx.admin.from("lab_tests").select("id, name, reference_range").eq("shop_id", ctx.shopId);
  const testId = (n: string) => tests!.find((t) => t.name === n)!.id;
  for (const p of PACKAGES) await createLabPackageAction(p.name, p.tests.map(testId));
  const { data: packages } = await ctx.admin.from("lab_packages").select("id, name").eq("shop_id", ctx.shopId);
  const packageId = (n: string) => packages!.find((p) => p.name === n)!.id;
  const patients = await insertCustomers(ctx, 26, { withGstin: 0, otherState: 0 });
  const products = await insertCatalog(ctx, COUNTER);

  /** A result inside the reference range most of the time, a little outside now and then. */
  const resultFor = (range: string | null, index: number): string => {
    const m = range?.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (!m) return ["Negative", "Not detected", "Normal", "Positive"][index % 4 === 3 ? 0 : index % 3];
    const low = Number(m[1]);
    const high = Number(m[2]);
    const span = high - low;
    const out = ctx.random.chance(0.22);
    const value = out ? (ctx.random.chance(0.5) ? high + span * 0.12 : Math.max(0, low - span * 0.1)) : low + span * (0.2 + ctx.random.next() * 0.6);
    return span >= 20 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
  };

  const place = async (i: number, daysAgo: number, target: "delivered" | "report_ready" | "processing" | "sample_collected" | "booked" | "cancelled", opts: { home?: boolean } = {}) => {
    const patient = patients[i % patients.length];
    const pkgChoices = ["Full Body Checkup", "Diabetes Profile", "Lipid Profile", "Thyroid Profile", "Fever Panel"];
    const single = [["Hemoglobin", "Vitamin D (25-OH)"], ["Fasting Blood Sugar"], ["Urine Routine & Microscopy", "Serum Creatinine"], ["CRP (C-Reactive Protein)", "Total WBC Count"], ["Vitamin B12", "Hemoglobin"]];
    const usePackage = i % 3 !== 1;
    const created = await createLabOrderAction({
      patientId: patient.id,
      patientName: patient.name,
      patientPhone: patient.phone,
      patientAge: String(22 + ((i * 5) % 50)),
      patientGender: i % 2 === 0 ? "male" : "female",
      referringDoctorName: DOCTORS[i % DOCTORS.length],
      collectionType: opts.home ? "home_collection" : "walk_in",
      homeAddress: opts.home ? "12, Laxmi Colony, near the temple" : "",
      collectionSlot: opts.home ? "7:00 - 9:00 AM" : "",
      phlebotomistId: null,
      testIds: usePackage ? [] : single[i % single.length].map(testId),
      packageIds: usePackage ? [packageId(pkgChoices[i % pkgChoices.length])] : [],
    });
    if (!created.orderId) throw new Error(`demo: lab order: ${created.error}`);
    const orderId = created.orderId;
    const advance = async (status: Parameters<typeof updateLabOrderStatusAction>[1]) => updateLabOrderStatusAction(orderId, status);

    if (target === "cancelled") await advance("cancelled");
    else if (target !== "booked") {
      await advance("sample_collected");
      if (target !== "sample_collected") {
        await advance("received_at_lab");
        await advance("processing");
        if (target !== "processing") {
          const { data: items } = await ctx.admin.from("lab_order_items").select("id, reference_range").eq("order_id", orderId);
          for (const [k, item] of (items ?? []).entries()) await saveTestResultAction(item.id, resultFor(item.reference_range, i + k));
          await advance("report_ready");
          if (target === "delivered") {
            const { data: its } = await ctx.admin.from("lab_order_items").select("price, gst_percent").eq("order_id", orderId);
            const total = Math.round((its ?? []).reduce((s, x) => s + Number(x.price) * (1 + Number(x.gst_percent) / 100), 0));
            const partial = i % 9 === 4;
            const billed = await billLabOrderAction(orderId, ctx.random.pick(["upi", "cash", "upi", "card"] as const), partial ? Math.round(total * 0.6) : total);
            if (billed.billId) await ctx.admin.from("bills").update({ created_at: isoAt(Math.max(0, daysAgo - 1), 12, 30) }).eq("id", billed.billId);
            await advance("delivered");
          }
        }
      }
    }
    await ctx.admin.from("lab_orders").update({ created_at: isoAt(daysAgo, 8 + (i % 9), (i * 17) % 60) }).eq("id", orderId);
  };

  const total = 34;
  for (let i = 0; i < total; i++) {
    const daysAgo = Math.max(2, Math.round(((total - 1 - i) / (total - 1)) ** 1.2 * 28) + 2);
    await place(i, daysAgo, i === 7 ? "cancelled" : "delivered", { home: i % 5 === 0 });
  }
  // Waiting for the report to be handed over, being processed, samples just collected, booked for tomorrow.
  await place(40, 1, "report_ready");
  await place(41, 1, "report_ready", { home: true });
  await place(42, 1, "processing");
  await place(43, 0, "processing");
  await place(44, 0, "sample_collected", { home: true });
  await place(45, 0, "sample_collected");
  await place(46, 0, "booked", { home: true });
  await place(47, 0, "booked");
  void dateOffset;
  void personName;

  await seedBills(ctx, products, patients, { count: 10, days: 30, itemsPerBill: [1, 2], qty: [1, 2], customerShare: 0.4, udhaarShare: 0.05 });
  await seedUdhaarPayments(ctx, patients);
  await seedPettyCash(ctx, [{ description: "Reagents top-up", amount: 6800, category: "Consumables", daysAgo: 6 }, { description: "Vacutainers and needles", amount: 2400, category: "Consumables", daysAgo: 10 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
