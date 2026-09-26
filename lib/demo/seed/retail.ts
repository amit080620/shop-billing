import type { DemoType } from "../config";
import { GENERAL, GROCERY, HARDWARE, MART, type Catalog } from "./catalogs";
import {
  insertCatalog,
  insertCustomers,
  enableCatalog,
  insertVendors,
  leaveSomeStockLow,
  seedBills,
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
};

const RETAIL: Partial<Record<DemoType, RetailConfig>> = {
  grocery: { catalog: GROCERY, customers: 14, gstinCustomers: 1, bills: 52, vendors: ["Anand Wholesale Traders", "Balaji Dairy Distributors", "Gujarat Foods Pvt Ltd"] },
  mart: { catalog: MART, customers: 16, gstinCustomers: 2, bills: 60, vendors: ["Metro Cash & Carry Supply", "Fresh Farms Produce", "HomeCare Distributors"] },
  hardware: { catalog: HARDWARE, customers: 12, gstinCustomers: 4, bills: 44, vendors: ["Shree Ganesh Hardware Agency", "Asian Paints Depot", "Polycab Authorised Dealer"] },
  general: { catalog: GENERAL, customers: 12, gstinCustomers: 1, bills: 40, vendors: ["Universal Stationers", "Digital World Accessories", "Home & Kitchen Wholesale"] },
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
  ]);

  await seedBills(ctx, products, customers, { count: cfg.bills, days: 30, customerShare: 0.55, udhaarShare: 0.2 });
  await seedUdhaarPayments(ctx, customers);
  await seedVendorPayment(ctx, vendors[2], 4000);
  await seedPettyCash(ctx, STANDARD_PETTY_CASH);
  await leaveSomeStockLow(ctx, products, 3);
  if (ctx.type === "grocery" || ctx.type === "mart") await enableCatalog(ctx, "Free home delivery on orders above Rs 500");
}
