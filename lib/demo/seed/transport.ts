import { createVehicleAction, updateVehicleDocumentsAction } from "@/lib/actions/transport";
import { dateOffset, formData, isoAt } from "../util";
import { transportExtrasReady } from "@/lib/transportData";
import type { Database } from "@/lib/supabase/database.types";
import { financialYearFor } from "@/lib/gst";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedPurchases, seedUdhaarPayments, seedVendorPayment, STANDARD_PETTY_CASH, type SeedCtx, type SeededCustomer } from "./common";

const MATERIALS: Catalog = [
  {
    category: "Sand & Aggregates",
    items: [
      { name: "River Sand (per brass)", price: 5200, gst: 5, hsn: "2505", unit: "BRASS", stock: 400, low: 40, bulk: [5, 5000] },
      { name: "M-Sand (per brass)", price: 4600, gst: 5, hsn: "2505", unit: "BRASS", stock: 300, low: 40 },
      { name: "20mm Aggregate (per brass)", price: 4200, gst: 5, hsn: "2517", unit: "BRASS", stock: 260, low: 30 },
      { name: "10mm Aggregate (per brass)", price: 4400, gst: 5, hsn: "2517", unit: "BRASS", stock: 220, low: 30 },
      { name: "Murum / Filling soil (per brass)", price: 1800, gst: 5, hsn: "2505", unit: "BRASS", stock: 500, low: 60 },
    ],
  },
  {
    category: "Bricks & Blocks",
    items: [
      { name: "Red Bricks (per 1000)", price: 8500, gst: 5, hsn: "6901", unit: "THOUSAND", stock: 90, low: 10 },
      { name: "Fly Ash Bricks (per 1000)", price: 6800, gst: 5, hsn: "6901", unit: "THOUSAND", stock: 70, low: 10 },
      { name: "Concrete Block 6 inch", price: 42, gst: 5, hsn: "6810", unit: "NOS", stock: 3000, low: 400 },
    ],
  },
  {
    category: "Cement & Steel",
    items: [
      { name: "Ultratech Cement OPC 43 (50kg)", price: 395, gst: 28, hsn: "2523", unit: "BAG", stock: 800, low: 100, bulk: [50, 380] },
      { name: "ACC Cement PPC (50kg)", price: 385, gst: 28, hsn: "2523", unit: "BAG", stock: 600, low: 100 },
      { name: "TMT Bar 12mm (per kg)", price: 68, gst: 18, hsn: "7214", unit: "KG", stock: 4000, low: 500 },
    ],
  },
];

const VEHICLES: { name: string; number: string; rate: number; docs: { rc: number; insurance: number; puc: number; fitness: number } }[] = [
  { name: "Tipper 10 wheel", number: "MH11 AB 1234", rate: 38, docs: { rc: 900, insurance: 210, puc: 95, fitness: 300 } },
  { name: "Tractor Trolley", number: "MH11 CD 5678", rate: 22, docs: { rc: 700, insurance: 24, puc: 150, fitness: 500 } },
  { name: "Mini Truck (Tata 407)", number: "MH11 EF 9012", rate: 18, docs: { rc: 800, insurance: -6, puc: 40, fitness: 250 } },
  { name: "JCB Loader", number: "MH11 GH 3456", rate: 50, docs: { rc: 1000, insurance: 340, puc: 200, fitness: 620 } },
];

export async function seedTransport(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, MATERIALS);
  const customers = await insertCustomers(ctx, 14, { withGstin: 5, otherState: 1 });
  const vendors = await insertVendors(ctx, [{ name: "Krishna River Sand Suppliers" }, { name: "Shree Brick Works" }, { name: "Ultratech Cement Dealer" }]);

  for (const v of VEHICLES) await createVehicleAction(null, formData({ name: v.name, vehicleNumber: v.number, ratePerKm: v.rate }));
  const { data: vehicles } = await ctx.admin.from("vehicles").select("id, name, rate_per_km").eq("shop_id", ctx.shopId);
  for (const v of vehicles ?? []) {
    const def = VEHICLES.find((x) => x.name === v.name)!;
    await updateVehicleDocumentsAction(v.id, {
      rcExpiry: dateOffset(def.docs.rc),
      insuranceExpiry: dateOffset(def.docs.insurance),
      pucExpiry: dateOffset(def.docs.puc),
      fitnessExpiry: dateOffset(def.docs.fitness),
    });
  }

  await seedPurchases(ctx, vendors, products, [
    { daysAgo: 24, vendorIndex: 0, productIndexes: [0, 1, 2, 3], qty: 60, paidShare: 1 },
    { daysAgo: 13, vendorIndex: 1, productIndexes: [5, 6], qty: 20, paidShare: 1 },
    { daysAgo: 4, vendorIndex: 2, productIndexes: [8, 9], qty: 200, paidShare: 0.4 },
  ]);

  const drivers = ["Ramesh Jadhav", "Santosh Pawar", "Dilip Shinde", "Ajit More"];
  await seedBills(ctx, products, customers, {
    count: 46,
    days: 30,
    itemsPerBill: [1, 2],
    qty: [2, 8],
    customerShare: 0.9,
    udhaarShare: 0.3,
    peakHours: [7, 8, 9, 10, 11, 14, 15, 16],
    // Most sales are delivered: add the transport line and record the trip.
    decorate: (bill, index) => {
      if (index % 5 === 4) return bill; // a few are collected from the yard
      const vehicle = vehicles![index % vehicles!.length];
      const km = 6 + ((index * 7) % 32) + 0.5;
      const charge = Math.round(km * Number(vehicle.rate_per_km) * 100) / 100;
      return {
        ...bill,
        items: [...bill.items, { productId: null, description: `Transport charge - ${vehicle.name} (${km} km)`, quantity: 1, unitPrice: charge, gstPercent: 5 }],
        tripVehicleId: vehicle.id,
        tripKm: km,
        tripDriverName: drivers[index % drivers.length],
        tripLoadWeight: 3 + (index % 6),
        tripLoadUnit: "TON",
      };
    },
  });
  // A trip belongs to the day of its bill.
  const { data: trips } = await ctx.admin.from("transport_trips").select("id, bill_id").eq("shop_id", ctx.shopId);
  for (const t of trips ?? []) {
    const { data: bill } = await ctx.admin.from("bills").select("created_at").eq("id", t.bill_id!).single();
    if (bill) await ctx.admin.from("transport_trips").update({ created_at: bill.created_at, trip_date: bill.created_at.slice(0, 10) }).eq("id", t.id);
  }
  await seedUdhaarPayments(ctx, customers);
  await seedVendorPayment(ctx, vendors[2], 30000);
  // Bilties and what the vehicles cost to run (migration 0049); before it, diesel and bhatta
  // go down as petty cash.
  const extras = await transportExtrasReady(ctx.admin);
  if (extras) await seedBiltiesAndExpenses(ctx, customers, vehicles ?? [], drivers);
  await seedPettyCash(ctx, [
    ...(extras ? [] : [{ description: "Diesel for Tractor", amount: 4200, category: "Fuel", daysAgo: 2 }, { description: "Tyre puncture repair", amount: 650, category: "Maintenance", daysAgo: 5 }, { description: "Driver bhatta", amount: 1500, category: "Staff", daysAgo: 3 }]),
    ...STANDARD_PETTY_CASH.slice(0, 2),
  ]);
}

/** A fortnight of bilties (delivered, on the road, just booked; paid, to pay and monthly-account
 * ones waiting for their bill) and the vehicles' diesel (with meter readings), toll, bhatta and a
 * repair — so Bilty, Vehicle expenses and Vehicle profit open with something in them. */
async function seedBiltiesAndExpenses(ctx: SeedCtx, customers: SeededCustomer[], vehicles: { id: string; name: string }[], drivers: string[]): Promise<void> {
  const { admin, shopId } = ctx;
  if (!vehicles.length || customers.length < 4) return;
  const { data: numbers } = await admin.from("vehicles").select("id, vehicle_number").eq("shop_id", shopId);
  const plate = new Map((numbers ?? []).map((v) => [v.id, v.vehicle_number]));
  const routes: [string, string, string, number, number, "paid" | "to_pay" | "tbb"][] = [
    ["Pune", "Mumbai", "Cement, 200 bags", 200, 10, "tbb"],
    ["Pune", "Nashik", "TMT bars", 0, 6, "to_pay"],
    ["Pune", "Satara", "Fly ash bricks", 0, 8, "paid"],
    ["Pune", "Mumbai", "Cement, 150 bags", 150, 7.5, "tbb"],
    ["Pune", "Ahmednagar", "River sand", 0, 12, "to_pay"],
    ["Pune", "Kolhapur", "Concrete blocks, 900 nos", 900, 9, "tbb"],
    ["Pune", "Mumbai", "Cement, 100 bags", 100, 5, "to_pay"],
    ["Pune", "Solapur", "20mm aggregate", 0, 11, "paid"],
  ];
  const rows: Database["public"]["Tables"]["consignments"]["Insert"][] = [];
  for (const [i, [from, to, goods, packages, tons, payBy]] of routes.entries()) {
    const daysAgo = [14, 12, 10, 8, 6, 3, 1, 0][i];
    const lrDate = dateOffset(-daysAgo);
    const fy = financialYearFor(new Date(`${lrDate}T12:00:00+05:30`));
    const { data: n } = await admin.rpc("next_lr_number", { p_shop_id: shopId, p_financial_year: fy });
    const vehicle = vehicles[i % vehicles.length];
    const sender = customers[i % 3];
    const receiver = customers[3 + (i % (customers.length - 3))];
    const status: "delivered" | "in_transit" | "booked" = daysAgo >= 3 ? "delivered" : daysAgo >= 1 ? "in_transit" : "booked";
    rows.push({
      shop_id: shopId,
      lr_number: `LR/${fy}/${String(n ?? i + 1).padStart(5, "0")}`,
      lr_date: lrDate,
      vehicle_id: vehicle.id,
      vehicle_number: plate.get(vehicle.id) ?? null,
      driver_name: drivers[i % drivers.length],
      consignor_customer_id: sender.id,
      consignor_name: sender.name,
      consignor_phone: sender.phone,
      consignee_customer_id: receiver.id,
      consignee_name: receiver.name,
      consignee_phone: receiver.phone,
      from_place: from,
      to_place: to,
      goods,
      packages: packages || null,
      packing: packages ? (goods.startsWith("Cement") ? "Bags" : "Loose") : "Loose",
      actual_weight: tons,
      charged_weight: tons,
      weight_unit: "TON",
      declared_value: goods.startsWith("Cement") ? packages * 390 : null,
      freight: Math.round(tons * (to === "Mumbai" ? 1400 : 1100)),
      other_charges: i % 3 === 0 ? 500 : 0,
      pay_by: payBy,
      status,
      dispatched_at: status === "booked" ? null : isoAt(daysAgo, 9),
      delivered_at: status === "delivered" ? isoAt(daysAgo - 1, 15) : null,
      received_by: status === "delivered" ? receiver.name : null,
      created_at: isoAt(daysAgo, 8),
    });
  }
  const { data: lrs } = await admin.from("consignments").insert(rows).select("id, vehicle_id, lr_date");

  // Diesel with meter readings on the two busiest vehicles, plus toll, bhatta and a repair.
  const expenses: Database["public"]["Tables"]["trip_expenses"]["Insert"][] = [];
  for (const [k, v] of vehicles.slice(0, 2).entries()) {
    let odo = 84000 + k * 31000;
    for (const daysAgo of [28, 21, 14, 7, 1]) {
      odo += 380 + k * 60;
      expenses.push({ shop_id: shopId, vehicle_id: v.id, expense_date: dateOffset(-daysAgo), category: "diesel", amount: 5800 + k * 400, litres: 62 + k * 4, odometer_km: odo, payment_method: "cash", created_at: isoAt(daysAgo, 7) });
    }
  }
  for (const lr of lrs ?? []) {
    const daysAgo = Math.round((Date.parse(`${dateOffset(0)}T00:00:00Z`) - Date.parse(`${lr.lr_date}T00:00:00Z`)) / 86400000);
    expenses.push({ shop_id: shopId, vehicle_id: lr.vehicle_id, consignment_id: lr.id, expense_date: lr.lr_date, category: "toll", amount: 640, payment_method: "upi", created_at: isoAt(daysAgo, 11) });
    expenses.push({ shop_id: shopId, vehicle_id: lr.vehicle_id, consignment_id: lr.id, expense_date: lr.lr_date, category: "driver", amount: 500, payment_method: "cash", created_at: isoAt(daysAgo, 12) });
  }
  expenses.push({ shop_id: shopId, vehicle_id: vehicles[1 % vehicles.length].id, expense_date: dateOffset(-5), category: "repair", amount: 3200, payment_method: "cash", note: "Clutch plate", created_at: isoAt(5, 16) });
  expenses.push({ shop_id: shopId, vehicle_id: vehicles[0].id, expense_date: dateOffset(-9), category: "tyre", amount: 650, payment_method: "cash", note: "Puncture", created_at: isoAt(9, 14) });
  await admin.from("trip_expenses").insert(expenses);
}
