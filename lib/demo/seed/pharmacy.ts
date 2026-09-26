import { createPurchaseAction } from "@/lib/actions/purchases";
import { writeOffBatchAction } from "@/lib/actions/pharmacy";
import { addDays } from "@/lib/hotel/dates";
import { formData, personName, todayIst } from "../util";
import type { Catalog } from "./catalogs";
import { ignoreRedirect, insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx } from "./common";

const P = (salt: string, schedule: "otc" | "h" | "h1" | "x", rack: string, extra: { units?: number; loose?: string; rx?: boolean } = {}) => ({ salt, schedule, rack, ...extra });

export const PHARMACY: Catalog = [
  {
    category: "OTC & Everyday",
    items: [
      { name: "Paracetamol 500mg (10 tab)", price: 32, gst: 12, hsn: "3004", unit: "STRIP", mrp: 35, stock: 0, low: 20, pharma: P("Paracetamol 500mg", "otc", "A1", { units: 10, loose: "tablet" }) },
      { name: "Cetirizine 10mg (10 tab)", price: 35, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 15, pharma: P("Cetirizine 10mg", "otc", "A1", { units: 10, loose: "tablet" }) },
      { name: "ORS Electral Powder", price: 22, gst: 5, hsn: "3004", unit: "PKT", stock: 0, low: 25, pharma: P("Oral rehydration salts", "otc", "A2") },
      { name: "Digene Gel 200ml", price: 115, gst: 12, hsn: "3004", unit: "BTL", stock: 0, low: 10, pharma: P("Antacid gel", "otc", "A2") },
      { name: "Volini Pain Relief Spray", price: 230, gst: 12, hsn: "3004", unit: "NOS", stock: 0, low: 8, pharma: P("Diclofenac + Menthol", "otc", "A3") },
      { name: "Vicks VapoRub 50ml", price: 85, gst: 12, hsn: "3004", unit: "NOS", stock: 0, low: 12, pharma: P("Menthol + Camphor", "otc", "A3") },
    ],
  },
  {
    category: "Prescription (Schedule H)",
    items: [
      { name: "Amoxicillin + Clavulanate 625 (10 tab)", price: 210, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 8, pharma: P("Amoxicillin 500mg + Clavulanic acid 125mg", "h", "B1", { units: 10, loose: "tablet", rx: true }) },
      { name: "Azithromycin 500mg (3 tab)", price: 120, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 8, pharma: P("Azithromycin 500mg", "h", "B1", { units: 3, loose: "tablet", rx: true }) },
      { name: "Metformin 500mg (20 tab)", price: 28, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 20, pharma: P("Metformin 500mg", "h", "B2", { units: 20, loose: "tablet", rx: true }) },
      { name: "Atorvastatin 10mg (15 tab)", price: 95, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 10, pharma: P("Atorvastatin 10mg", "h", "B2", { units: 15, loose: "tablet", rx: true }) },
      { name: "Pantoprazole 40mg (15 tab)", price: 110, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 10, pharma: P("Pantoprazole 40mg", "h", "B3", { units: 15, loose: "tablet", rx: true }) },
      { name: "Telmisartan 40mg (10 tab)", price: 85, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 10, pharma: P("Telmisartan 40mg", "h", "B3", { units: 10, loose: "tablet", rx: true }) },
    ],
  },
  {
    category: "Controlled (Schedule H1)",
    items: [
      { name: "Cefixime 200mg (10 tab)", price: 140, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 6, pharma: P("Cefixime 200mg", "h1", "C1", { units: 10, loose: "tablet", rx: true }) },
      { name: "Alprazolam 0.25mg (10 tab)", price: 58, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 4, pharma: P("Alprazolam 0.25mg", "h1", "C1", { units: 10, loose: "tablet", rx: true }) },
      { name: "Tramadol 50mg (10 cap)", price: 78, gst: 12, hsn: "3004", unit: "STRIP", stock: 0, low: 4, pharma: P("Tramadol 50mg", "h1", "C2", { units: 10, loose: "capsule", rx: true }) },
    ],
  },
  {
    category: "Devices & Wellness",
    items: [
      { name: "Omron BP Monitor HEM-7120", price: 1850, gst: 18, hsn: "9018", unit: "NOS", mrp: 2400, stock: 6, low: 2, warrantyMonths: 24 },
      { name: "Digital Thermometer", price: 250, gst: 18, hsn: "9025", unit: "NOS", stock: 12, low: 3, warrantyMonths: 6 },
      { name: "Dabur Chyawanprash 500g", price: 235, gst: 12, hsn: "3004", unit: "JAR", stock: 14, low: 4 },
      { name: "Cerelac Wheat Apple 300g", price: 220, gst: 5, hsn: "1901", unit: "PKT", stock: 10, low: 4 },
    ],
  },
];

// The register adds "Dr." itself.
const DOCTORS = ["Anil Sharma", "Meera Kulkarni", "Suresh Patel", "Rekha Joshi"];

export async function seedPharmacy(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, PHARMACY);
  const customers = await insertCustomers(ctx, 14, { withGstin: 0, otherState: 1 });
  const vendors = await insertVendors(ctx, [{ name: "Apex Pharma Distributors" }, { name: "Sanjivani Medicos Wholesale" }, { name: "Cipla Authorised Stockist" }]);
  const today = todayIst();

  // Stock comes in as batches with expiry dates: most are fine, a couple are close, one is already past.
  const pharma = products.filter((p) => p.category !== "Devices & Wellness");
  const monthsAhead = (m: number) => addDays(today, m * 30);
  const batchPlan: { productIndex: number; vendor: number; qty: number; expiry: string; batch: string; mfg: string; daysAgo: number }[] = [];
  pharma.forEach((p, i) => {
    batchPlan.push({ productIndex: i, vendor: i % 3, qty: 40 + (i % 4) * 15, expiry: monthsAhead(10 + (i % 9)), batch: `B${2410 + i}A`, mfg: addDays(today, -60 - i), daysAgo: 20 });
  });
  // Near-expiry and expired batches on a few medicines — added after the sales below,
  // because the app sells the earliest-expiring batch first and would use them up.
  const late: typeof batchPlan = [];
  late.push({ productIndex: 0, vendor: 0, qty: 12, expiry: addDays(today, 16), batch: "B2309X", mfg: addDays(today, -700), daysAgo: 24 });
  late.push({ productIndex: 3, vendor: 1, qty: 9, expiry: addDays(today, 28), batch: "B2311D", mfg: addDays(today, -690), daysAgo: 24 });
  late.push({ productIndex: 8, vendor: 2, qty: 10, expiry: addDays(today, 6), batch: "B2306M", mfg: addDays(today, -720), daysAgo: 24 });
  late.push({ productIndex: 2, vendor: 0, qty: 15, expiry: addDays(today, -12), batch: "B2210Q", mfg: addDays(today, -740), daysAgo: 24 });

  let invoice = 1;
  const receive = async (plan: typeof batchPlan) => {
  for (const b of plan) {
    const product = pharma[b.productIndex];
    const cost = Math.round((product.price / (1 + product.gst / 100)) * 0.78 * 100) / 100;
    const gross = b.qty * cost * (1 + product.gst / 100);
    const payload = {
      vendorId: vendors[b.vendor].id,
      vendorInvoiceNumber: `PH/${2600 + invoice++}`,
      purchaseDate: addDays(today, -b.daysAgo),
      items: [{ productId: product.id, description: product.name, quantity: b.qty, unitPrice: cost, gstPercent: product.gst, batchNumber: b.batch, expiryDate: b.expiry, mfgDate: b.mfg }],
      paidAmount: Math.round(gross),
      paymentMethod: "upi",
      itcEligible: true,
      reverseCharge: false,
    };
    await ignoreRedirect(() => createPurchaseAction(null, formData({ payload: JSON.stringify(payload) })));
  }
  const { data: purchases } = await ctx.admin.from("purchases").select("id, purchase_date").eq("shop_id", ctx.shopId);
  for (const row of purchases ?? []) await ctx.admin.from("purchases").update({ created_at: `${row.purchase_date}T11:00:00+05:30` }).eq("id", row.id);
  };
  await receive(batchPlan);

  // A month of sales. Prescription medicines carry the doctor's and patient's name.
  const rxIds = new Set(products.filter((p) => p.category !== "OTC & Everyday" && p.category !== "Devices & Wellness").map((p) => p.id));
  await seedBills(ctx, products, customers, {
    count: 58,
    days: 30,
    itemsPerBill: [1, 3],
    qty: [1, 3],
    customerShare: 0.7,
    udhaarShare: 0.12,
    peakHours: [9, 10, 11, 12, 17, 18, 19, 20, 21],
    // Recent expired stock must not be sold: keep sales to the in-date pool.
    decorate: (bill) => {
      const needsRx = bill.items.some((i) => i.productId && rxIds.has(i.productId));
      if (!needsRx) return bill;
      return { ...bill, doctorName: ctx.random.pick(DOCTORS), patientName: personName(ctx.random) };
    },
  });
  await seedUdhaarPayments(ctx, customers);
  await receive(late);

  // The expired batch is written off, like the Expiry alerts screen would.
  const { data: expired } = await ctx.admin.from("medicine_batches").select("id, product_id, quantity").eq("shop_id", ctx.shopId).lt("expiry_date", today).limit(1);
  if (expired?.[0]) {
    await writeOffBatchAction(null, formData({ batchId: expired[0].id, productId: expired[0].product_id, quantity: Math.min(5, Number(expired[0].quantity)), reason: "expired", notes: "Removed from the shelf" }));
  }

  await seedPettyCash(ctx, STANDARD_PETTY_CASH);
}
