import { addPartToJobAction, assignTechnicianAction, createJobAction, deliverJobAction, updateJobStatusAction } from "@/lib/actions/service";
import { dateOffset, formData, isoAt } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedPurchases, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx } from "./common";

const PARTS: Catalog = [
  {
    category: "Mobile parts",
    items: [
      { name: "Samsung M31 Display Assembly", price: 2800, gst: 18, hsn: "8517", unit: "NOS", stock: 8, low: 3 },
      { name: "Universal Type-C Charging Port", price: 180, gst: 18, hsn: "8536", unit: "NOS", stock: 40, low: 10 },
      { name: "iPhone 12 Battery (Original)", price: 2400, gst: 18, hsn: "8507", unit: "NOS", stock: 6, low: 2 },
      { name: "Tempered Glass (Universal)", price: 99, gst: 18, hsn: "7007", unit: "NOS", stock: 60, low: 15 },
    ],
  },
  {
    category: "Laptop & TV parts",
    items: [
      { name: "Laptop Keyboard (Dell Inspiron)", price: 1250, gst: 18, hsn: "8471", unit: "NOS", stock: 5, low: 2 },
      { name: "Thermal Paste Tube", price: 220, gst: 18, hsn: "3506", unit: "NOS", stock: 20, low: 5 },
      { name: "TV Backlight Strip 43 inch", price: 1600, gst: 18, hsn: "8529", unit: "SET", stock: 4, low: 2 },
    ],
  },
  {
    category: "AC & Appliance",
    items: [
      { name: "AC Gas R32 Refill (per kg)", price: 650, gst: 18, hsn: "2903", unit: "KG", stock: 30, low: 6 },
      { name: "AC Capacitor 35uF", price: 320, gst: 18, hsn: "8532", unit: "NOS", stock: 14, low: 4 },
      { name: "Washing Machine Drum Bearing Set", price: 780, gst: 18, hsn: "8482", unit: "SET", stock: 5, low: 2 },
      { name: "Mixer Grinder Motor", price: 1150, gst: 18, hsn: "8501", unit: "NOS", stock: 3, low: 2 },
    ],
  },
];

type Category = "mobile" | "laptop" | "appliance" | "bike";

const JOBS: {
  item: string;
  category: Category;
  identifiers: { label: string; value: string }[];
  issue: string;
  estimate: number;
  parts?: [string, number][];
  final?: number;
  technician: string;
  daysAgo: number;
  state: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
}[] = [
  { item: "Samsung Galaxy M31", category: "mobile", identifiers: [{ label: "IMEI", value: "356938035643809" }], issue: "Screen cracked after a fall", estimate: 3200, parts: [["Samsung M31 Display Assembly", 1]], final: 3400, technician: "Ramesh", daysAgo: 28, state: "delivered" },
  { item: "LG 1.5 Ton Split AC", category: "appliance", identifiers: [{ label: "Model No.", value: "LS-Q18YNZA" }], issue: "Not cooling, gas leak suspected", estimate: 2200, parts: [["AC Gas R32 Refill (per kg)", 1], ["AC Capacitor 35uF", 1]], final: 1900, technician: "Imran", daysAgo: 26, state: "delivered" },
  { item: "Redmi Note 10", category: "mobile", identifiers: [{ label: "IMEI", value: "861234050912345" }], issue: "Phone not charging", estimate: 450, parts: [["Universal Type-C Charging Port", 1]], final: 450, technician: "Ramesh", daysAgo: 25, state: "delivered" },
  { item: "Dell Inspiron 15", category: "laptop", identifiers: [{ label: "Serial No.", value: "DL5F3J2" }], issue: "Keyboard keys not working", estimate: 1800, parts: [["Laptop Keyboard (Dell Inspiron)", 1]], final: 1800, technician: "Suresh", daysAgo: 23, state: "delivered" },
  { item: "Whirlpool 7kg Washing Machine", category: "appliance", identifiers: [{ label: "Serial No.", value: "WP7-88213" }], issue: "Loud noise from the drum", estimate: 1500, parts: [["Washing Machine Drum Bearing Set", 1]], final: 1600, technician: "Imran", daysAgo: 21, state: "delivered" },
  { item: "Honda Activa 6G", category: "bike", identifiers: [{ label: "Registration No.", value: "MH04 KP 2210" }], issue: "General service and oil change", estimate: 800, final: 750, technician: "Nitin", daysAgo: 19, state: "delivered" },
  { item: "iPhone 12", category: "mobile", identifiers: [{ label: "IMEI", value: "353456789012345" }], issue: "Battery drains very fast", estimate: 3000, parts: [["iPhone 12 Battery (Original)", 1]], final: 3000, technician: "Ramesh", daysAgo: 17, state: "delivered" },
  { item: "HP Pavilion 14", category: "laptop", identifiers: [{ label: "Serial No.", value: "5CD1234XYZ" }], issue: "Overheating and shutting down", estimate: 900, parts: [["Thermal Paste Tube", 1]], final: 900, technician: "Suresh", daysAgo: 15, state: "delivered" },
  { item: "Samsung 43 inch Smart TV", category: "appliance", identifiers: [{ label: "Model No.", value: "UA43T5350" }], issue: "Screen dim, backlight failure", estimate: 2400, parts: [["TV Backlight Strip 43 inch", 1]], final: 2400, technician: "Imran", daysAgo: 13, state: "delivered" },
  { item: "Voltas 1 Ton Window AC", category: "appliance", identifiers: [{ label: "Model No.", value: "123V-CZJ" }], issue: "Annual service and gas top-up", estimate: 1400, parts: [["AC Gas R32 Refill (per kg)", 1]], final: 1400, technician: "Imran", daysAgo: 11, state: "delivered" },
  { item: "OnePlus Nord CE", category: "mobile", identifiers: [{ label: "IMEI", value: "867530012345678" }], issue: "Screen guard and back panel replacement", estimate: 500, parts: [["Tempered Glass (Universal)", 1]], final: 450, technician: "Ramesh", daysAgo: 9, state: "delivered" },
  { item: "Bajaj Mixer Grinder", category: "appliance", identifiers: [{ label: "Serial No.", value: "BJ-MX-7712" }], issue: "Motor burnt, smell while running", estimate: 1350, parts: [["Mixer Grinder Motor", 1]], final: 1350, technician: "Suresh", daysAgo: 7, state: "delivered" },
  { item: "Hero Splendor Plus", category: "bike", identifiers: [{ label: "Registration No.", value: "MH04 AB 4477" }], issue: "Brake and chain adjustment", estimate: 400, final: 400, technician: "Nitin", daysAgo: 5, state: "delivered" },
  { item: "Dell Latitude 5490", category: "laptop", identifiers: [{ label: "Serial No.", value: "DLAT549077" }], issue: "Windows reinstall and virus removal", estimate: 700, final: 700, technician: "Suresh", daysAgo: 3, state: "delivered" },
  // Ready and waiting to be picked up.
  { item: "Vivo Y21", category: "mobile", identifiers: [{ label: "IMEI", value: "864209050123456" }], issue: "Display flickering", estimate: 2100, parts: [["Tempered Glass (Universal)", 1]], technician: "Ramesh", daysAgo: 4, state: "ready" },
  { item: "IFB Front Load Washer", category: "appliance", identifiers: [{ label: "Model No.", value: "Senator WSS" }], issue: "Water not draining", estimate: 950, technician: "Imran", daysAgo: 3, state: "ready" },
  { item: "Lenovo IdeaPad 3", category: "laptop", identifiers: [{ label: "Serial No.", value: "PF2K4LM9" }], issue: "Battery not charging", estimate: 1600, technician: "Suresh", daysAgo: 2, state: "ready" },
  { item: "Bajaj Pulsar 150", category: "bike", identifiers: [{ label: "Registration No.", value: "MH04 XY 9988" }], issue: "Full service", estimate: 1200, technician: "Nitin", daysAgo: 2, state: "ready" },
  // Being worked on.
  { item: "Samsung Galaxy A52", category: "mobile", identifiers: [{ label: "IMEI", value: "351234098765432" }], issue: "Water damage, not switching on", estimate: 2800, technician: "Ramesh", daysAgo: 2, state: "in_progress" },
  { item: "Daikin 1.5 Ton Inverter AC", category: "appliance", identifiers: [{ label: "Model No.", value: "FTKM50" }], issue: "Remote not working, PCB check", estimate: 3500, technician: "Imran", daysAgo: 2, state: "in_progress" },
  { item: "Asus VivoBook", category: "laptop", identifiers: [{ label: "Serial No.", value: "L1N0CV12" }], issue: "Screen flickering", estimate: 4200, technician: "Suresh", daysAgo: 1, state: "in_progress" },
  { item: "Sony Bravia 50 inch", category: "appliance", identifiers: [{ label: "Model No.", value: "KD-50X75" }], issue: "No picture, sound only", estimate: 5200, technician: "Imran", daysAgo: 1, state: "in_progress" },
  { item: "Yamaha FZ", category: "bike", identifiers: [{ label: "Registration No.", value: "MH04 LM 3321" }], issue: "Engine noise checkup", estimate: 900, technician: "Nitin", daysAgo: 1, state: "in_progress" },
  // Just came in.
  { item: "Realme 9 Pro", category: "mobile", identifiers: [{ label: "IMEI", value: "869876543210987" }], issue: "Speaker not working", estimate: 700, technician: "", daysAgo: 0, state: "received" },
  { item: "Godrej 190L Refrigerator", category: "appliance", identifiers: [{ label: "Serial No.", value: "GR190-4410" }], issue: "Cooling issue, compressor noise", estimate: 2500, technician: "", daysAgo: 0, state: "received" },
  { item: "Canon Printer G2010", category: "laptop", identifiers: [{ label: "Serial No.", value: "KLJ22019" }], issue: "Prints blank pages", estimate: 600, technician: "", daysAgo: 0, state: "received" },
  { item: "Old Nokia phone", category: "mobile", identifiers: [], issue: "Customer collected without repair", estimate: 300, technician: "Ramesh", daysAgo: 6, state: "cancelled" },
];

export async function seedService(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, PARTS);
  const customers = await insertCustomers(ctx, 20, { withGstin: 0, otherState: 0 });
  const vendors = await insertVendors(ctx, [{ name: "Ganesh Mobile Spares" }, { name: "Cool Air Spares Depot" }, { name: "TechParts India" }]);
  await seedPurchases(ctx, vendors, products, [
    { daysAgo: 22, vendorIndex: 0, productIndexes: [0, 1, 2, 3], qty: 8, paidShare: 1 },
    { daysAgo: 10, vendorIndex: 1, productIndexes: [7, 8, 9], qty: 8, paidShare: 1 },
  ]);
  const byName = (n: string) => products.find((p) => p.name === n)!;

  for (const [i, j] of JOBS.entries()) {
    const customer = customers[i % customers.length];
    const created = await createJobAction(
      null,
      formData({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: JSON.stringify([{ name: j.item, quantity: 1, notes: "" }]),
        issueDescription: j.issue,
        estimatedCost: j.estimate,
        expectedDate: dateOffset(-j.daysAgo + 3),
        advancePaid: j.state === "received" ? 0 : Math.min(500, Math.round(j.estimate * 0.25)),
        deviceCategory: j.category,
        identifiers: JSON.stringify(j.identifiers),
      }),
    );
    if (!created?.jobId) throw new Error(`demo: job ${j.item}`);
    const jobId = created.jobId;
    if (j.technician) await assignTechnicianAction(jobId, j.technician);
    for (const [partName, qty] of j.parts ?? []) await addPartToJobAction(jobId, byName(partName).id, qty);

    if (j.state === "in_progress") await updateJobStatusAction(jobId, "in_progress");
    if (j.state === "ready") await updateJobStatusAction(jobId, "ready");
    if (j.state === "cancelled") await updateJobStatusAction(jobId, "cancelled");
    if (j.state === "delivered") {
      await updateJobStatusAction(jobId, "in_progress");
      await updateJobStatusAction(jobId, "ready");
      const { data: job } = await ctx.admin.from("service_jobs").select("advance_paid").eq("id", jobId).single();
      // Labour is what is left after the parts, which the bill adds at their own price.
      const partsTotal = (j.parts ?? []).reduce((s, [n, q]) => s + byName(n).price * q, 0);
      const labour = Math.max(150, (j.final ?? j.estimate) - partsTotal);
      const due = labour + partsTotal;
      const result = await deliverJobAction(jobId, labour, 18, Math.max(0, due - Number(job?.advance_paid ?? 0)), ctx.random.pick(["upi", "cash", "cash", "card"] as const));
      if (result.error) throw new Error(`demo: deliver: ${result.error}`);
      if (result.billId) await ctx.admin.from("bills").update({ created_at: isoAt(Math.max(0, j.daysAgo - 2), 17) }).eq("id", result.billId);
    }
    const stamps: { created_at: string; ready_at?: string; delivered_at?: string } = { created_at: isoAt(j.daysAgo, 11, 15) };
    if (j.state === "ready" || j.state === "delivered") stamps.ready_at = isoAt(Math.max(0, j.daysAgo - 1), 16);
    if (j.state === "delivered") stamps.delivered_at = isoAt(Math.max(0, j.daysAgo - 2), 17);
    await ctx.admin.from("service_jobs").update(stamps).eq("id", jobId);
  }

  // Walk-in sales of small accessories.
  await seedBills(ctx, products.filter((p) => p.category === "Mobile parts"), customers, { count: 14, days: 30, itemsPerBill: [1, 2], customerShare: 0.3 });
  await seedUdhaarPayments(ctx, customers);
  await seedPettyCash(ctx, [{ description: "Soldering wire and flux", amount: 420, category: "Tools", daysAgo: 6 }, { description: "Shop rent (part)", amount: 8000, category: "Rent", daysAgo: 10 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
