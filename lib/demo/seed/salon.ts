import { createAppointmentAction, updateAppointmentStatusAction } from "@/lib/actions/appointments";
import { saveBookingSettingsAction } from "@/lib/actions/clinic";
import { dateOffset, formData, isoAt, personName } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedPurchases, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx, type SeededCustomer, type SeededProduct } from "./common";
import { payrollReady } from "@/lib/payrollData";
import { salonExtrasReady } from "@/lib/salonExtras";

const SERVICES: Catalog = [
  {
    category: "Hair",
    items: [
      { name: "Haircut - Men", price: 250, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Haircut - Women", price: 450, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Beard Trim & Shape", price: 120, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Hair Colour (per application)", price: 1200, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Global Hair Colour", price: 2500, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Keratin Treatment", price: 4500, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Head Massage (20 min)", price: 300, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
    ],
  },
  {
    category: "Skin & Nails",
    items: [
      { name: "Facial - Fruit", price: 900, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Clean-up", price: 500, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Manicure", price: 600, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Pedicure", price: 700, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Threading - Eyebrow", price: 60, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Waxing - Full Arms", price: 400, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
    ],
  },
  {
    category: "Bridal & Party",
    items: [
      { name: "Bridal Makeup", price: 8000, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Party Makeup", price: 2500, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
      { name: "Hair Styling / Updo", price: 1200, gst: 18, hsn: "9602", unit: "NOS", stock: 0 },
    ],
  },
];

const RETAIL: Catalog = [
  {
    category: "Products for sale",
    items: [
      { name: "L'Oreal Shampoo 340ml", price: 420, gst: 18, hsn: "3305", unit: "BTL", mrp: 480, stock: 24, low: 5 },
      { name: "Matrix Conditioner 200ml", price: 380, gst: 18, hsn: "3305", unit: "BTL", stock: 16, low: 4 },
      { name: "Hair Serum 100ml", price: 550, gst: 18, hsn: "3305", unit: "BTL", stock: 12, low: 3 },
      { name: "Beard Oil 30ml", price: 299, gst: 18, hsn: "3305", unit: "BTL", stock: 18, low: 4 },
      { name: "Face Wash 100ml", price: 240, gst: 18, hsn: "3304", unit: "TUBE", stock: 20, low: 5 },
    ],
  },
];

const STYLISTS = ["Pooja", "Ravi", "Meena", "Sana"];

export async function seedSalon(ctx: SeedCtx): Promise<void> {
  const services = await insertCatalog(ctx, SERVICES, { track: false });
  const retail = await insertCatalog(ctx, RETAIL);
  const products = [...services, ...retail];
  const customers = await insertCustomers(ctx, 24, { withGstin: 0, otherState: 0 });
  const vendors = await insertVendors(ctx, [{ name: "Beauty World Distributors" }, { name: "Salon Pro Supplies" }]);
  await seedPurchases(ctx, vendors, products, [{ daysAgo: 20, vendorIndex: 0, productIndexes: [16, 17, 18, 19, 20], qty: 12, paidShare: 1 }]);

  // Online booking: opening hours and a shareable link.
  const hours = { start: "10:00", end: "20:00" };
  await saveBookingSettingsAction({
    slotDurationMinutes: 45,
    workingHours: { mon: [hours], tue: [hours], wed: [hours], thu: [hours], fri: [hours], sat: [{ start: "10:00", end: "21:00" }], sun: [{ start: "11:00", end: "18:00" }] },
    isPublicBookingEnabled: true,
    doctorName: "Glow Unisex Salon",
    unavailableDates: [],
  });

  // A month of billing: every bill names the stylist who did the work.
  await seedBills(ctx, products, customers, {
    count: 64,
    days: 30,
    itemsPerBill: [1, 3],
    qty: [1, 1],
    customerShare: 0.75,
    udhaarShare: 0.05,
    peakHours: [11, 12, 13, 16, 17, 18, 19],
    decorate: (bill) => ({ ...bill, serviceProviderName: ctx.random.pick(STYLISTS) }),
  });
  await seedUdhaarPayments(ctx, customers);

  // The appointment book: earlier visits, today's schedule, and the days ahead.
  const svc = (n: number) => services[n % services.length].name;
  const make = async (dayOffset: number, time: string, customerIndex: number, service: number, stylist: string, status?: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show", notes?: string) => {
    const customer = customers[customerIndex % customers.length];
    await createAppointmentAction(null, formData({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, serviceName: svc(service), stylistName: stylist, appointmentDate: dateOffset(dayOffset), appointmentTime: time, notes }));
    if (status && status !== "booked") {
      const { data } = await ctx.admin.from("appointments").select("id").eq("shop_id", ctx.shopId).order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) await updateAppointmentStatusAction(data[0].id, status);
    }
  };
  for (let d = -6; d <= -1; d++) {
    for (const [k, time] of ["11:00", "14:30", "17:00"].entries()) {
      const status = (d + k) % 5 === 0 ? "no_show" : (d + k) % 7 === 0 ? "cancelled" : "completed";
      await make(d, time, Math.abs(d) * 3 + k, Math.abs(d) + k * 2, STYLISTS[(Math.abs(d) + k) % 4], status);
    }
  }
  await make(0, "10:30", 1, 1, "Pooja", "completed");
  await make(0, "11:30", 2, 8, "Sana", "completed");
  await make(0, "13:00", 3, 3, "Meena", "arrived", "Wants the same shade as last time");
  await make(0, "15:15", 4, 0, "Ravi", "confirmed");
  await make(0, "16:30", 5, 10, "Sana", "booked");
  await make(0, "18:00", 6, 14, "Pooja", "booked", "Bridal trial");
  await make(1, "11:00", 7, 5, "Meena", "confirmed", "Keratin - needs 3 hours");
  await make(1, "14:00", 8, 9, "Sana", "booked");
  await make(1, "17:30", 9, 1, "Pooja", "booked");
  await make(2, "12:00", 10, 15, "Pooja", "confirmed", "Party makeup");
  await make(3, "16:00", 11, 0, "Ravi", "booked");
  await make(4, "10:30", personName(ctx.random).length % 20, 2, "Ravi", "booked");
  const { data: appts } = await ctx.admin.from("appointments").select("id, appointment_date").eq("shop_id", ctx.shopId);
  for (const a of appts ?? []) {
    const days = Math.max(0, Math.round((new Date().getTime() - new Date(`${a.appointment_date}T12:00:00+05:30`).getTime()) / 86400000)) + 1;
    await ctx.admin.from("appointments").update({ created_at: isoAt(days, 10) }).eq("id", a.id);
  }

  await seedSalonExtras(ctx, services, customers);

  await seedPettyCash(ctx, [{ description: "Towels laundry", amount: 600, category: "Housekeeping", daysAgo: 3 }, { description: "Disposable gloves and strips", amount: 950, category: "Supplies", daysAgo: 8 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}

/** The payroll list with commission, two package plans with customers part-way through them, and
 * a prepaid balance — each only once its migration has run (0046, 0048). */
async function seedSalonExtras(ctx: SeedCtx, services: SeededProduct[], customers: SeededCustomer[]): Promise<void> {
  const { admin, shopId } = ctx;
  if (!(await payrollReady(admin))) return;
  const extras = await salonExtrasReady(admin);
  const salary: Record<string, number> = { Pooja: 18000, Ravi: 14000, Meena: 16000, Sana: 12000 };
  await admin.from("workers").insert(
    STYLISTS.map((name, i) => ({
      shop_id: shopId,
      name,
      designation: name === "Sana" ? "Beautician" : "Stylist",
      pay_type: "monthly" as const,
      monthly_salary: salary[name],
      joined_on: dateOffset(-420 + i * 45),
      ...(extras ? { commission_service_percent: [10, 8, 10, 12][i], commission_product_percent: 5 } : {}),
    })),
  );
  if (!extras) return;

  const facial = services.find((s) => s.name === "Facial - Fruit");
  const haircut = services.find((s) => s.name === "Haircut - Men");
  if (!facial || !haircut) return;
  const { data: plans } = await admin
    .from("products")
    .insert([
      { shop_id: shopId, name: "Fruit Facial — 5 sessions", price: 3999, gst_percent: 18, hsn_code: "9602", unit: "NOS", track_inventory: false, package_service_id: facial.id, package_sessions: 5, package_validity_days: 180 },
      { shop_id: shopId, name: "Men's Haircut — 10 visits", price: 2000, gst_percent: 18, hsn_code: "9602", unit: "NOS", track_inventory: false, package_service_id: haircut.id, package_sessions: 10, package_validity_days: 365 },
    ])
    .select("id, name, price, package_service_id, package_sessions, package_validity_days");
  // Two customers part-way through a package (bought a few weeks ago).
  for (const [k, plan] of (plans ?? []).entries()) {
    const customer = customers[k + 2];
    if (!customer) continue;
    const sessions = Number(plan.package_sessions);
    const { data: pkg } = await admin
      .from("customer_packages")
      .insert({
        shop_id: shopId,
        customer_id: customer.id,
        plan_product_id: plan.id,
        name: plan.name,
        service_product_id: plan.package_service_id,
        service_name: plan.package_service_id === facial.id ? facial.name : haircut.name,
        sessions_total: sessions,
        session_value: Math.round((Number(plan.price) / 1.18 / sessions) * 100) / 100,
        starts_on: dateOffset(-24),
        expires_on: dateOffset(-24 + Number(plan.package_validity_days)),
        created_at: isoAt(24, 12),
      })
      .select("id")
      .single();
    if (pkg) await admin.from("package_uses").insert({ shop_id: shopId, package_id: pkg.id, quantity: k === 0 ? 2 : 3, created_at: isoAt(10, 16) });
  }

  // One regular keeps money with the salon: ₹5,000 paid in, ₹500 more from the shop.
  const regular = customers[1];
  if (regular) {
    await admin.from("wallet_entries").insert({ shop_id: shopId, customer_id: regular.id, kind: "topup", money: 5000, credit: 5500, payment_method: "upi", note: "Paid 5000 + 500 extra", created_at: isoAt(12, 18) });
    await admin.from("cash_movements").insert({ shop_id: shopId, kind: "advance_received", source: "wallet", source_id: regular.id, payment_method: "upi", amount: 5000, note: `Prepaid balance — ${regular.name}`, created_at: isoAt(12, 18) });
  }
}
