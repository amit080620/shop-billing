import type { DemoType } from "../config";
import { isoAt } from "../util";
import { GENERAL, GROCERY, HARDWARE, MART, type Catalog, type CatalogItem } from "./catalogs";
import {
  insertCatalog,
  insertCustomers,
  enableCatalog,
  insertVendors,
  leaveSomeStockLow,
  seedBills,
  seedCatalogOrders,
  seedItemRequests,
  seedOldUdhaar,
  seedPettyCash,
  seedPurchases,
  seedUdhaarPayments,
  seedVendorPayment,
  STANDARD_PETTY_CASH,
  type SeedCtx,
} from "./common";

type RetailConfig = {
  catalog: Catalog;
  customers: number;
  gstinCustomers: number;
  bills: number;
  vendors: string[];
  /** Stock that has not sold for months: shows up as dead stock and in the profit-leak screen. */
  slowMovers: CatalogItem[];
  /** Things customers asked for that the shop did not have. */
  wanted: { item: string; advance?: number; daysAhead?: number }[];
};

const RETAIL: Partial<Record<DemoType, RetailConfig>> = {
  grocery: {
    catalog: GROCERY,
    customers: 14,
    gstinCustomers: 1,
    bills: 52,
    vendors: ["Anand Wholesale Traders", "Balaji Dairy Distributors", "Gujarat Foods Pvt Ltd"],
    slowMovers: [
      { name: "Imported Olive Oil 500ml", price: 950, gst: 5, hsn: "1509", unit: "BTL", stock: 14, low: 3 },
      { name: "Protein Muesli 1kg", price: 640, gst: 18, hsn: "1904", unit: "PKT", stock: 22, low: 5 },
      { name: "Quinoa 500g", price: 420, gst: 5, hsn: "1008", unit: "PKT", stock: 18, low: 4 },
    ],
    wanted: [{ item: "Sabudana 5 kg for Navratri" }, { item: "Organic jaggery 2 kg", daysAhead: 5 }],
  },
  mart: {
    catalog: MART,
    customers: 16,
    gstinCustomers: 2,
    bills: 60,
    vendors: ["Metro Cash & Carry Supply", "Fresh Farms Produce", "HomeCare Distributors"],
    slowMovers: [
      { name: "Air Fryer 4L", price: 4800, gst: 18, hsn: "8516", unit: "NOS", stock: 6, low: 2 },
      { name: "Non-stick Tawa Set", price: 1350, gst: 18, hsn: "7615", unit: "SET", stock: 9, low: 3 },
      { name: "Imported Cheese Slices", price: 380, gst: 12, hsn: "0406", unit: "PKT", stock: 20, low: 5 },
    ],
    wanted: [{ item: "Cordless vacuum cleaner", advance: 1000, daysAhead: 6 }, { item: "Gluten-free atta 5 kg" }],
  },
  hardware: {
    catalog: HARDWARE,
    customers: 12,
    gstinCustomers: 4,
    bills: 44,
    vendors: ["Shree Ganesh Hardware Agency", "Asian Paints Depot", "Polycab Authorised Dealer"],
    slowMovers: [
      { name: "Digital Vernier Caliper", price: 850, gst: 18, hsn: "9017", unit: "NOS", stock: 11, low: 3 },
      { name: "Laser Distance Meter", price: 2400, gst: 18, hsn: "9015", unit: "NOS", stock: 5, low: 2 },
    ],
    wanted: [{ item: "Bosch 13 mm hammer drill", advance: 500, daysAhead: 4 }, { item: "Teflon plumbing tape, 50 rolls" }],
  },
  general: {
    catalog: GENERAL,
    customers: 12,
    gstinCustomers: 1,
    bills: 40,
    vendors: ["Universal Stationers", "Digital World Accessories", "Home & Kitchen Wholesale"],
    slowMovers: [
      { name: "Bluetooth Speaker Mini", price: 1200, gst: 18, hsn: "8518", unit: "NOS", stock: 14, low: 3 },
      { name: "Yoga Mat 6mm", price: 700, gst: 12, hsn: "9506", unit: "NOS", stock: 16, low: 4 },
    ],
    wanted: [{ item: "Casio FX-991 scientific calculator", daysAhead: 3 }, { item: "A3 drawing sheets, 200 pcs" }],
  },
};

/** Grocery, mart, hardware and general: a catalogue, customers with udhaar, vendors
 * and purchases, and a month of bills. */
export async function seedRetail(ctx: SeedCtx): Promise<void> {
  const cfg = RETAIL[ctx.type];
  if (!cfg) throw new Error(`demo: no retail config for ${ctx.type}`);

  const products = await insertCatalog(ctx, cfg.catalog);
  const customers = await insertCustomers(ctx, cfg.customers, { withGstin: cfg.gstinCustomers, otherState: 2 });
  const vendors = await insertVendors(ctx, [
    { name: cfg.vendors[0] },
    { name: cfg.vendors[1] },
    { name: cfg.vendors[2], stateCode: ctx.session.shopStateCode === "24" ? "27" : "24" },
  ]);

  const n = products.length;
  await seedPurchases(ctx, vendors, products, [
    { daysAgo: 26, vendorIndex: 0, productIndexes: [0, 1, 2, 3, 4, 5].map((i) => i % n), qty: 24, paidShare: 1 },
    { daysAgo: 16, vendorIndex: 1, productIndexes: [6, 7, 8, 9, 10].map((i) => i % n), qty: 18, paidShare: 1 },
    { daysAgo: 6, vendorIndex: 2, productIndexes: [11, 12, 13, 14, 15].map((i) => i % n), qty: 15, paidShare: 0.5 },
    // The first two items again, from a second vendor at a higher rate: the price-comparison report has something to compare.
    { daysAgo: 21, vendorIndex: 1, productIndexes: [0, 1].map((i) => i % n), qty: 12, paidShare: 1, costFactor: 0.9 },
    // One item bought for more than it sells for: a leak the profit-leak screen points at.
    { daysAgo: 3, vendorIndex: 2, productIndexes: [2 % n], qty: 10, paidShare: 1, costFactor: 1.3 },
  ]);

  const billIds = await seedBills(ctx, products, customers, { count: cfg.bills, days: 30, customerShare: 0.55, udhaarShare: 0.2 });
  await seedUdhaarPayments(ctx, customers);
  await seedVendorPayment(ctx, vendors[2], 4000);
  await seedPettyCash(ctx, STANDARD_PETTY_CASH);

  // Credit that has been lying unpaid for weeks, and stock nobody buys.
  await seedOldUdhaar(ctx, products, customers, [
    { customerIndex: 3, daysAgo: 41, productIndexes: [0, 1, 2], qty: 2 },
    { customerIndex: 5, daysAgo: 57, productIndexes: [3, 4], qty: 3 },
  ]);
  await insertCatalog(ctx, [{ category: "Slow movers", items: cfg.slowMovers }], { fastBilling: false });
  await seedItemRequests(ctx, customers, cfg.wanted);

  // Two entries in the audit log, so the screen is not empty before anyone has voided or changed a bill.
  await ctx.admin.from("audit_logs").insert([
    { shop_id: ctx.shopId, staff_id: ctx.session.userId, action: "bill_quantities_edited", entity_type: "bill", entity_id: billIds[Math.max(0, billIds.length - 4)], details: { reason: "Customer took one packet less", changes: [] }, created_at: isoAt(3, 17, 20) },
    { shop_id: ctx.shopId, staff_id: ctx.session.userId, action: "bill_voided", entity_type: "bill", entity_id: billIds[Math.max(0, billIds.length - 9)], details: { reason: "Bill was entered twice" }, created_at: isoAt(6, 11, 5) },
  ]);

  await leaveSomeStockLow(ctx, products, 3);
  if (ctx.type === "grocery" || ctx.type === "mart") {
    await enableCatalog(ctx, "Free home delivery on orders above Rs 500");
    await seedCatalogOrders(ctx, products);
  }
}
