import { cancelRentalAction, createRentalAction, markRentalActiveAction, returnRentalAction } from "@/lib/actions/rentals";
import { calculateRentalTotals } from "@/lib/validation/schemas";
import { determineSupplyType } from "@/lib/gst";
import { dateOffset, formData, isoAt } from "../util";
import type { Catalog } from "./catalogs";
import { ignoreRedirect, insertCatalog, insertCustomers, seedBills, seedPettyCash, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx, type SeededCustomer, type SeededProduct } from "./common";

const RENTALS: Catalog = [
  {
    category: "Furniture",
    items: [
      { name: "Plastic Chair", price: 0, gst: 18, hsn: "9401", unit: "NOS", stock: 300, rent: { daily: 8, weekly: 40, deposit: 0 } },
      { name: "Round Table (6 seater)", price: 0, gst: 18, hsn: "9403", unit: "NOS", stock: 40, rent: { daily: 150, weekly: 700, deposit: 500 } },
      { name: "Sofa Set (3+1+1)", price: 0, gst: 18, hsn: "9401", unit: "SET", stock: 6, rent: { daily: 1800, weekly: 8000, deposit: 4000 } },
    ],
  },
  {
    category: "Tents & Decor",
    items: [
      { name: "Tent 20x20 ft", price: 0, gst: 18, hsn: "6306", unit: "NOS", stock: 8, rent: { daily: 3500, weekly: 16000, deposit: 5000 } },
      { name: "Decorative Stage", price: 0, gst: 18, hsn: "9403", unit: "NOS", stock: 3, rent: { daily: 6000, deposit: 8000 } },
      { name: "Carpet 10x10 ft", price: 0, gst: 18, hsn: "5703", unit: "NOS", stock: 25, rent: { daily: 300, weekly: 1400, deposit: 500 } },
    ],
  },
  {
    category: "Sound & Lights",
    items: [
      { name: "Sound System (2 speakers + mic)", price: 0, gst: 18, hsn: "8518", unit: "SET", stock: 5, rent: { hourly: 400, daily: 2500, deposit: 5000 } },
      { name: "DJ Light Set", price: 0, gst: 18, hsn: "9405", unit: "SET", stock: 5, rent: { daily: 1200, deposit: 2500 } },
      { name: "Generator 5 kVA", price: 0, gst: 18, hsn: "8502", unit: "NOS", stock: 3, rent: { daily: 2000, deposit: 6000 } },
    ],
  },
  {
    category: "Catering",
    items: [
      { name: "Crockery Set (per 50 people)", price: 0, gst: 18, hsn: "6911", unit: "SET", stock: 30, rent: { daily: 250, deposit: 500 } },
      { name: "Air Cooler", price: 0, gst: 18, hsn: "8479", unit: "NOS", stock: 12, rent: { daily: 350, weekly: 1800, deposit: 1500 } },
    ],
  },
  {
    category: "Sale items",
    items: [
      { name: "Balloons (pack of 100)", price: 120, gst: 18, hsn: "4016", unit: "PKT", stock: 80, low: 15 },
      { name: "Disposable Plates (100)", price: 180, gst: 18, hsn: "4823", unit: "PKT", stock: 60, low: 12 },
      { name: "Decoration Ribbon Roll", price: 45, gst: 12, hsn: "5806", unit: "NOS", stock: 90, low: 20 },
      { name: "LED String Lights 10m", price: 249, gst: 18, hsn: "9405", unit: "NOS", stock: 40, low: 8 },
    ],
  },
];

type Line = { name: string; qty: number; days: number };

export async function seedRental(ctx: SeedCtx): Promise<void> {
  const products = await insertCatalog(ctx, RENTALS);
  const customers = await insertCustomers(ctx, 14, { withGstin: 2, otherState: 1 });
  const byName = (n: string): SeededProduct => products.find((p) => p.name === n)!;
  const { data: rentable } = await ctx.admin.from("products").select("id, name, rental_rate_daily, security_deposit, gst_percent").eq("shop_id", ctx.shopId).eq("is_rentable", true);
  const info = new Map((rentable ?? []).map((r) => [r.name, r]));

  /** Books a rental like the New Rental screen: dates, items at the daily rate, deposit, part or full payment. */
  const rent = async (customer: SeededCustomer, startOffset: number, days: number, lines: Line[], paidShare: number, opts: { delivery?: number; notes?: string } = {}) => {
    const items = lines.map((l) => {
      const p = info.get(l.name)!;
      return { productId: byName(l.name).id, description: l.name, quantity: l.qty, rateType: "daily" as const, rate: Number(p.rental_rate_daily), duration: l.days, gstPercent: Number(p.gst_percent), depositPerUnit: Number(p.security_deposit) };
    });
    const totals = calculateRentalTotals({
      items: items.map((i) => ({ quantity: i.quantity, rate: i.rate, duration: i.duration, gstPercent: i.gstPercent, depositPerUnit: i.depositPerUnit })),
      deliveryCharge: opts.delivery ?? 0,
      paidAmount: 0,
      supplyType: determineSupplyType(ctx.session.shopStateCode ?? "27", null),
      priceMode: "inclusive",
    });
    const payload = {
      customerId: customer.id,
      startDate: dateOffset(startOffset),
      endDate: dateOffset(startOffset + days),
      items,
      deliveryRequired: !!opts.delivery,
      deliveryAddress: opts.delivery ? "Community hall, Gandhi Nagar" : undefined,
      deliveryCharge: opts.delivery ?? 0,
      paidAmount: Math.round(totals.total * paidShare),
      paymentMethod: "upi",
      notes: opts.notes,
    };
    await ignoreRedirect(() => createRentalAction(null, formData({ payload: JSON.stringify(payload) })));
    const { data: created } = await ctx.admin.from("rentals").select("id").eq("shop_id", ctx.shopId).order("created_at", { ascending: false }).limit(1);
    return created![0].id;
  };

  const settle = async (rentalId: string, opts: { damage?: number; late?: number; returnedOffset: number }) => {
    const { data: items } = await ctx.admin.from("rental_items").select("id").eq("rental_id", rentalId);
    await markRentalActiveAction(rentalId);
    await returnRentalAction(
      null,
      formData({ rentalId, damageCharge: opts.damage ?? 0, lateFee: opts.late ?? 0, items: JSON.stringify((items ?? []).map((i, k) => ({ rentalItemId: i.id, condition: opts.damage && k === 0 ? "damaged" : "good", damageNotes: opts.damage && k === 0 ? "Torn cover" : undefined }))) }),
    );
    await ctx.admin.from("rentals").update({ actual_return_date: new Date(`${dateOffset(opts.returnedOffset)}T18:00:00+05:30`).toISOString() }).eq("id", rentalId);
  };

  const c = (i: number) => customers[i % customers.length];
  const ids: { id: string; startOffset: number }[] = [];

  // Finished rentals over the last month, one after the other so stock never clashes.
  const past: { customer: number; start: number; days: number; lines: Line[]; paid: number; damage?: number; late?: number }[] = [
    { customer: 0, start: -29, days: 2, lines: [{ name: "Plastic Chair", qty: 150, days: 2 }, { name: "Round Table (6 seater)", qty: 15, days: 2 }], paid: 1 },
    { customer: 1, start: -26, days: 1, lines: [{ name: "Sound System (2 speakers + mic)", qty: 1, days: 1 }, { name: "DJ Light Set", qty: 1, days: 1 }], paid: 1 },
    { customer: 2, start: -24, days: 3, lines: [{ name: "Tent 20x20 ft", qty: 2, days: 3 }, { name: "Carpet 10x10 ft", qty: 4, days: 3 }], paid: 0.6 },
    { customer: 3, start: -22, days: 1, lines: [{ name: "Crockery Set (per 50 people)", qty: 6, days: 1 }, { name: "Air Cooler", qty: 3, days: 1 }], paid: 1 },
    { customer: 4, start: -20, days: 2, lines: [{ name: "Decorative Stage", qty: 1, days: 2 }, { name: "Sound System (2 speakers + mic)", qty: 1, days: 2 }], paid: 1, damage: 1500 },
    { customer: 5, start: -17, days: 1, lines: [{ name: "Plastic Chair", qty: 200, days: 1 }], paid: 1 },
    { customer: 6, start: -15, days: 4, lines: [{ name: "Sofa Set (3+1+1)", qty: 2, days: 4 }, { name: "Carpet 10x10 ft", qty: 2, days: 4 }], paid: 0.5, late: 1000 },
    { customer: 7, start: -12, days: 2, lines: [{ name: "Generator 5 kVA", qty: 1, days: 2 }, { name: "Tent 20x20 ft", qty: 1, days: 2 }], paid: 1 },
    { customer: 8, start: -9, days: 1, lines: [{ name: "Round Table (6 seater)", qty: 20, days: 1 }, { name: "Plastic Chair", qty: 120, days: 1 }], paid: 1 },
    { customer: 9, start: -6, days: 2, lines: [{ name: "Sound System (2 speakers + mic)", qty: 2, days: 2 }, { name: "DJ Light Set", qty: 2, days: 2 }], paid: 1 },
  ];
  for (const p of past) {
    const id = await rent(c(p.customer), p.start, p.days, p.lines, p.paid, { delivery: p.customer % 3 === 0 ? 500 : 0 });
    await settle(id, { damage: p.damage, late: p.late, returnedOffset: p.start + p.days });
    ids.push({ id, startOffset: p.start });
  }

  // Out with customers right now, one of them overdue.
  const out1 = await rent(c(10), -1, 3, [{ name: "Tent 20x20 ft", qty: 3, days: 3 }, { name: "Plastic Chair", qty: 180, days: 3 }, { name: "Round Table (6 seater)", qty: 18, days: 3 }], 0.5, { delivery: 800, notes: "Wedding - Kolhapur road" });
  await markRentalActiveAction(out1);
  const out2 = await rent(c(11), 0, 1, [{ name: "Sound System (2 speakers + mic)", qty: 1, days: 1 }, { name: "DJ Light Set", qty: 1, days: 1 }], 1);
  await markRentalActiveAction(out2);
  const overdue = await rent(c(12), -6, 4, [{ name: "Air Cooler", qty: 4, days: 4 }, { name: "Generator 5 kVA", qty: 1, days: 4 }], 0.6, { notes: "Customer asked for two more days" });
  await markRentalActiveAction(overdue);
  ids.push({ id: out1, startOffset: -1 }, { id: out2, startOffset: 0 }, { id: overdue, startOffset: -6 });

  // Booked for the coming days, and one cancelled.
  ids.push({ id: await rent(c(13), 2, 2, [{ name: "Decorative Stage", qty: 1, days: 2 }, { name: "Carpet 10x10 ft", qty: 6, days: 2 }], 0.3, { notes: "Reception - hall booking confirmed" }), startOffset: 2 });
  ids.push({ id: await rent(c(0), 5, 3, [{ name: "Tent 20x20 ft", qty: 4, days: 3 }, { name: "Plastic Chair", qty: 250, days: 3 }], 0.4, { delivery: 1200 }), startOffset: 5 });
  ids.push({ id: await rent(c(1), 9, 1, [{ name: "Crockery Set (per 50 people)", qty: 10, days: 1 }], 0), startOffset: 9 });
  const cancelled = await rent(c(2), 3, 1, [{ name: "Sofa Set (3+1+1)", qty: 1, days: 1 }], 0.5);
  await cancelRentalAction(cancelled, "Event postponed by the customer");
  ids.push({ id: cancelled, startOffset: 3 });

  // The app stamped "now" on every rental: bring the booking dates back to when they were made.
  for (const r of ids) {
    await ctx.admin.from("rentals").update({ created_at: isoAt(Math.max(0, -r.startOffset + 2), 12) }).eq("id", r.id);
  }

  // Ordinary counter sales next to the rentals.
  const saleProducts = products.filter((p) => p.category === "Sale items");
  await seedBills(ctx, saleProducts, customers, { count: 22, days: 30, itemsPerBill: [1, 3], qty: [1, 4], customerShare: 0.4, udhaarShare: 0.1 });
  await seedUdhaarPayments(ctx, customers);
  await seedPettyCash(ctx, [{ description: "Tent repair - stitching", amount: 1800, category: "Maintenance", daysAgo: 7 }, { description: "Tempo for delivery", amount: 1500, category: "Transport", daysAgo: 2 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
