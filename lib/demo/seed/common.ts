import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SessionContext } from "@/lib/auth";
import { createBillCore } from "@/lib/actions/bills";
import { createPurchaseAction } from "@/lib/actions/purchases";
import { recordPaymentAction } from "@/lib/actions/customers";
import { recordVendorPaymentAction } from "@/lib/actions/vendors";
import { calculateTransactionTotals, type BillInput } from "@/lib/validation/schemas";
import { stateNameForCode } from "@/lib/constants/states";
import type { DemoType } from "../config";
import { dateOffset, fakePhone, formData, isoAt, personName, rng } from "../util";
import type { Catalog } from "./catalogs";

export type Admin = SupabaseClient<Database>;

/** Everything a seeder needs: the database, the demo shop's owner session, and a
 * repeatable random source. */
export type SeedCtx = {
  admin: Admin;
  session: SessionContext;
  shopId: string;
  type: DemoType;
  random: ReturnType<typeof rng>;
};

export type SeededProduct = { id: string; name: string; price: number; gst: number; category: string };
export type SeededCustomer = { id: string; name: string; phone: string };
export type SeededVendor = { id: string; name: string };

/** Server actions that end in redirect() throw a special error; that is a success here. */
export async function ignoreRedirect<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) return null;
    throw error;
  }
}

/** `track: false` is for things that are not counted in stock (a restaurant menu, a salon's services). */
export async function insertCatalog(ctx: SeedCtx, catalog: Catalog, opts: { track?: boolean; fastBilling?: boolean } = {}): Promise<SeededProduct[]> {
  const track = opts.track ?? true;
  const out: SeededProduct[] = [];
  // Barcodes must be unique within the shop, also across several catalogue calls.
  const { count: existing } = await ctx.admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", ctx.shopId);
  let barcode = 8901000010000 + (existing ?? 0);
  for (const group of catalog) {
    const { data: category, error: categoryError } = await ctx.admin.from("categories").insert({ shop_id: ctx.shopId, name: group.category }).select("id").single();
    if (categoryError || !category) throw new Error(`demo: category ${group.category}: ${categoryError?.message}`);
    const rows = group.items.map((item) => ({
      shop_id: ctx.shopId,
      category_id: category.id,
      name: item.name,
      price: item.price,
      gst_percent: item.gst,
      hsn_code: item.hsn ?? null,
      unit: item.unit ?? "NOS",
      mrp: item.mrp ?? null,
      track_inventory: track,
      stock_quantity: track ? item.stock : 0,
      low_stock_threshold: item.low ?? 5,
      barcode: String(barcode++),
      has_warranty: !!item.warrantyMonths,
      warranty_months: item.warrantyMonths ?? null,
      bulk_min_qty: item.bulk?.[0] ?? null,
      bulk_price: item.bulk?.[1] ?? null,
      offer_price: item.offer?.[0] ?? null,
      offer_label: item.offer?.[1] ?? null,
      metal_type: item.metal?.type ?? null,
      purity: item.metal?.purity ?? null,
      making_charge_type: item.metal?.making[0] ?? null,
      making_charge_value: item.metal?.making[1] ?? null,
      wastage_percent: item.metal?.wastage ?? null,
      hallmark_number: item.metal?.hallmark ?? null,
      is_rentable: !!item.rent,
      rental_rate_hourly: item.rent?.hourly ?? null,
      rental_rate_daily: item.rent?.daily ?? null,
      rental_rate_weekly: item.rent?.weekly ?? null,
      rental_rate_monthly: item.rent?.monthly ?? null,
      security_deposit: item.rent?.deposit ?? 0,
      is_pharma: !!item.pharma,
      requires_prescription: !!item.pharma?.rx,
      salt_composition: item.pharma?.salt ?? null,
      rack_location: item.pharma?.rack ?? null,
      drug_schedule: item.pharma?.schedule ?? null,
      units_per_pack: item.pharma?.units ?? null,
      loose_unit_name: item.pharma?.loose ?? null,
      show_in_catalog: true,
      show_in_fast_billing: (opts.fastBilling ?? true) && out.length < 12,
      fast_billing_order: out.length,
    }));
    const { data, error } = await ctx.admin.from("products").insert(rows).select("id, name, price, gst_percent");
    if (error || !data) throw new Error(`demo: products ${group.category}: ${error?.message}`);
    for (const p of data) out.push({ id: p.id, name: p.name, price: Number(p.price), gst: Number(p.gst_percent), category: group.category });
  }
  return out;
}

export async function insertCustomers(ctx: SeedCtx, count: number, opts: { startIndex?: number; withGstin?: number; otherState?: number } = {}): Promise<SeededCustomer[]> {
  const start = opts.startIndex ?? 1;
  const homeState = ctx.session.shopStateCode ?? "27";
  // A few customers from another state, so the bill shows IGST instead of CGST + SGST.
  const otherStateCode = homeState === "24" ? "27" : "24";
  const rows = Array.from({ length: count }, (_, i) => {
    const name = personName(ctx.random);
    const n = start + i;
    const b2b = i < (opts.withGstin ?? 0);
    return {
      shop_id: ctx.shopId,
      name: b2b ? `${name.split(" ")[1]} Enterprises` : name,
      phone: fakePhone(n),
      state_code: i < (opts.otherState ?? 0) ? otherStateCode : homeState,
      state: stateNameForCode(i < (opts.otherState ?? 0) ? otherStateCode : homeState),
      gstin: b2b ? `${homeState}AAAPD${String(1000 + n).slice(-4)}C1Z${i % 9}` : null,
      address: `${ctx.random.int(1, 99)}, ${ctx.random.pick(["MG Road", "Station Road", "Market Yard", "Gandhi Nagar", "Nehru Chowk", "Laxmi Colony"])}`,
      date_of_birth: dateOffset(-365 * ctx.random.int(22, 60) - ctx.random.int(0, 300)),
      gender: ctx.random.chance(0.5) ? ("male" as const) : ("female" as const),
    };
  });
  const { data, error } = await ctx.admin.from("customers").insert(rows).select("id, name, phone");
  if (error || !data) throw new Error(`demo: customers: ${error?.message}`);
  // A few birthdays fall this week so the Birthdays screen has something on it.
  for (const [i, c] of data.slice(0, 3).entries()) {
    const dob = new Date(Date.now() + 5.5 * 3600e3 + (i + 1) * 86400e3);
    dob.setUTCFullYear(dob.getUTCFullYear() - 30 - i * 4);
    await ctx.admin.from("customers").update({ date_of_birth: dob.toISOString().slice(0, 10) }).eq("id", c.id);
  }
  return data;
}

export async function insertVendors(ctx: SeedCtx, names: { name: string; stateCode?: string }[]): Promise<SeededVendor[]> {
  const rows = names.map((v, i) => ({
    shop_id: ctx.shopId,
    name: v.name,
    phone: fakePhone(900 + i),
    gstin: `${v.stateCode ?? ctx.session.shopStateCode ?? "27"}AAAPV${String(2000 + i)}C1Z${(i + 3) % 9}`,
    state_code: v.stateCode ?? ctx.session.shopStateCode ?? "27",
    state: stateNameForCode(v.stateCode ?? ctx.session.shopStateCode ?? "27"),
    address: "Wholesale Market, Main Road",
  }));
  const { data, error } = await ctx.admin.from("vendors").insert(rows).select("id, name");
  if (error || !data) throw new Error(`demo: vendors: ${error?.message}`);
  return data;
}

/** Buys stock from vendors the way the Purchase screen does (stock goes up, ITC recorded). */
export async function seedPurchases(ctx: SeedCtx, vendors: SeededVendor[], products: SeededProduct[], plan: { daysAgo: number; vendorIndex: number; productIndexes: number[]; qty: number; paidShare: number; /** 0.82 by default; above about 1.3 the goods cost more than they sell for. */ costFactor?: number }[]) {
  let n = 1;
  for (const p of plan) {
    const vendor = vendors[p.vendorIndex % vendors.length];
    const items = p.productIndexes.map((idx) => {
      const product = products[idx % products.length];
      const cost = Math.round((product.price / (1 + product.gst / 100)) * (p.costFactor ?? 0.82) * 100) / 100;
      return { productId: product.id, description: product.name, quantity: p.qty, unitPrice: cost, gstPercent: product.gst };
    });
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const gross = items.reduce((s, i) => s + i.quantity * i.unitPrice * (1 + i.gstPercent / 100), 0);
    const payload = {
      vendorId: vendor.id,
      vendorInvoiceNumber: `${vendor.name.slice(0, 3).toUpperCase()}/${2600 + n}`,
      purchaseDate: dateOffset(-p.daysAgo),
      items,
      paidAmount: Math.round(gross * p.paidShare),
      paymentMethod: "upi",
      itcEligible: true,
      reverseCharge: false,
    };
    void subtotal;
    n++;
    await ignoreRedirect(() => createPurchaseAction(null, formData({ payload: JSON.stringify(payload) })));
  }
  // The action stamps "now": move each purchase to its own day, oldest first.
  const { data: purchases } = await ctx.admin.from("purchases").select("id, purchase_date").eq("shop_id", ctx.shopId);
  for (const row of purchases ?? []) {
    await ctx.admin.from("purchases").update({ created_at: `${row.purchase_date}T11:00:00+05:30` }).eq("id", row.id);
  }
}

export type BillPlan = {
  count: number;
  days: number;
  itemsPerBill?: [number, number];
  qty?: [number, number];
  customerShare?: number;
  udhaarShare?: number;
  /** Pick from this subset of products instead of all of them. */
  productPool?: SeededProduct[];
  /** Adds fields to a bill (doctor name, service provider...). */
  decorate?: (bill: BillInput, index: number) => BillInput;
  peakHours?: number[];
};

/** Creates bills through the same code the New Bill screen uses (so invoice numbers,
 * GST, stock and credit are all real), oldest first, then moves each to its own date. */
export async function seedBills(ctx: SeedCtx, products: SeededProduct[], customers: SeededCustomer[], plan: BillPlan): Promise<string[]> {
  const pool = plan.productPool ?? products;
  const ids: string[] = [];
  const [minItems, maxItems] = plan.itemsPerBill ?? [1, 4];
  const [minQty, maxQty] = plan.qty ?? [1, 3];
  const methods = ["cash", "cash", "upi", "upi", "upi", "card", "online"] as const;
  // Spread over `days`, more recent days a little busier.
  const daysAgoList = Array.from({ length: plan.count }, (_, i) => Math.round(((plan.count - 1 - i) / Math.max(1, plan.count - 1)) ** 1.25 * (plan.days - 1)))
    .sort((a, b) => b - a);

  for (let i = 0; i < plan.count; i++) {
    const lines = ctx.random.int(minItems, maxItems);
    const chosen = ctx.random.shuffle(pool).slice(0, lines);
    const items = chosen.map((p) => ({ productId: p.id, description: p.name, quantity: ctx.random.int(minQty, maxQty), unitPrice: p.price, gstPercent: p.gst }));
    const withCustomer = customers.length > 0 && ctx.random.chance(plan.customerShare ?? 0.6);
    const customer = withCustomer ? ctx.random.pick(customers) : null;
    const discountPercent = ctx.random.chance(0.12) ? 5 : 0;
    let bill: BillInput = {
      customerId: customer?.id ?? null,
      items,
      discountType: "percent",
      discountValue: discountPercent,
      paidAmount: 0,
      paymentMethod: ctx.random.pick(methods),
    };
    // Extra lines (a transport charge, say) are added first, so the payment covers them too.
    if (plan.decorate) bill = plan.decorate(bill, i);
    const totals = calculateTransactionTotals({
      items: bill.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice, gstPercent: it.gstPercent })),
      discountType: "percent",
      discountValue: discountPercent,
      paidAmount: 0,
      supplyType: "intra",
      priceMode: ctx.session.priceIncludesGst ? "inclusive" : "exclusive",
    });
    const onCredit = customer !== null && ctx.random.chance(plan.udhaarShare ?? 0.18);
    // Old gold handed over counts as part of the payment.
    const exchange = bill.exchangeValue ?? 0;
    bill = { ...bill, paidAmount: onCredit ? Math.round(totals.total * ctx.random.pick([0, 0.3, 0.5])) : Math.max(0, totals.total - exchange) };
    const result = await createBillCore(ctx.session, bill);
    if ("error" in result) throw new Error(`demo: bill ${i}: ${result.error}`);
    ids.push(result.billId);
    const hour = plan.peakHours ? ctx.random.pick(plan.peakHours) : ctx.random.pick([9, 10, 11, 12, 13, 16, 17, 18, 19, 20]);
    await ctx.admin.from("bills").update({ created_at: isoAt(daysAgoList[i], hour, ctx.random.int(0, 59)) }).eq("id", result.billId);
  }
  return ids;
}

/** Some of the udhaar comes back, so customers show every state: settled, part-paid, overdue. */
export async function seedUdhaarPayments(ctx: SeedCtx, customers: SeededCustomer[]) {
  const { data: owing } = await ctx.admin.from("bills").select("customer_id, credit_amount").eq("shop_id", ctx.shopId).gt("credit_amount", 0).not("customer_id", "is", null);
  const perCustomer = new Map<string, number>();
  for (const b of owing ?? []) perCustomer.set(b.customer_id!, (perCustomer.get(b.customer_id!) ?? 0) + Number(b.credit_amount));
  let k = 0;
  for (const [customerId, amount] of perCustomer) {
    if (k % 2 === 0 && customers.some((c) => c.id === customerId)) {
      await recordPaymentAction(null, formData({ customerId, amount: Math.max(1, Math.round(amount * 0.5)), paymentMethod: "upi", note: "Part payment" }));
    }
    k++;
  }
  const { data: rows } = await ctx.admin.from("payments").select("id").eq("shop_id", ctx.shopId);
  for (const [i, row] of (rows ?? []).entries()) {
    await ctx.admin.from("payments").update({ created_at: isoAt(2 + i * 3, 17, 30) }).eq("id", row.id);
  }
}

export async function seedVendorPayment(ctx: SeedCtx, vendor: SeededVendor, amount: number) {
  await recordVendorPaymentAction(null, formData({ vendorId: vendor.id, amount, paymentMethod: "upi", note: "On account" }));
}

export async function seedPettyCash(ctx: SeedCtx, entries: { description: string; amount: number; category?: string; daysAgo: number }[]) {
  const rows = entries.map((e) => ({
    shop_id: ctx.shopId,
    description: e.description,
    amount: e.amount,
    category: e.category ?? "General",
    expense_type: "business" as const,
    payment_method: "cash",
    staff_id: ctx.session.userId,
    created_at: isoAt(e.daysAgo, 18, 0),
  }));
  const { error } = await ctx.admin.from("petty_cash_entries").insert(rows);
  if (error) throw new Error(`demo: petty cash: ${error.message}`);
}

/** After the sales, a few items sit below their reorder level so the low-stock
 * screens and Ray's "moves" have something to say. */
export async function leaveSomeStockLow(ctx: SeedCtx, products: SeededProduct[], count = 3) {
  for (const p of products.slice(-count)) {
    await ctx.admin.from("products").update({ stock_quantity: 2 }).eq("id", p.id);
  }
}

export const STANDARD_PETTY_CASH = [
  { description: "Shop electricity bill", amount: 2450, category: "Utilities", daysAgo: 6 },
  { description: "Tea and snacks for staff", amount: 380, category: "Staff", daysAgo: 4 },
  { description: "Cleaning supplies", amount: 620, category: "Maintenance", daysAgo: 9 },
  { description: "Courier charges", amount: 240, category: "Transport", daysAgo: 3 },
  { description: "Printer paper and ink", amount: 890, category: "Stationery", daysAgo: 12 },
  { description: "Auto rickshaw for delivery", amount: 150, category: "Transport", daysAgo: 1 },
];

/** Switches on the shop's online catalogue: the public link customers can browse and order from. */
export async function enableCatalog(ctx: SeedCtx, banner: string, delivery = true) {
  const { error } = await ctx.admin.from("catalog_settings").upsert({ shop_id: ctx.shopId, is_enabled: true, banner_text: banner, delivery_enabled: delivery, delivery_charge: 30 });
  if (error) throw new Error(`demo: catalogue: ${error.message}`);
}

/** Old credit that was never paid back (30 days and more), so Udhaar aging has its older groups
 * and the Profit-leak screen has money that is stuck. */
export async function seedOldUdhaar(ctx: SeedCtx, products: SeededProduct[], customers: SeededCustomer[], entries: { customerIndex: number; daysAgo: number; productIndexes: number[]; qty: number }[]) {
  for (const e of entries) {
    const customer = customers[e.customerIndex % customers.length];
    const items = e.productIndexes.map((i) => {
      const p = products[i % products.length];
      return { productId: p.id, description: p.name, quantity: e.qty, unitPrice: p.price, gstPercent: p.gst };
    });
    const result = await createBillCore(ctx.session, { customerId: customer.id, items, discountType: "percent", discountValue: 0, paidAmount: 0, paymentMethod: "cash" });
    if ("error" in result) throw new Error(`demo: old udhaar bill: ${result.error}`);
    await ctx.admin.from("bills").update({ created_at: isoAt(e.daysAgo, 12, 15) }).eq("id", result.billId);
  }
}

/** Orders customers placed from the shop's online catalogue link, waiting for the owner to accept. */
export async function seedCatalogOrders(ctx: SeedCtx, products: SeededProduct[]) {
  const orders = [
    { hoursAgo: 3, delivery: true, picks: [0, 3, 5], qty: [2, 1, 1] },
    { hoursAgo: 20, delivery: false, picks: [1, 2], qty: [1, 3] },
  ];
  for (const [n, o] of orders.entries()) {
    const { data: request, error } = await ctx.admin
      .from("catalog_order_requests")
      .insert({
        shop_id: ctx.shopId,
        customer_name: personName(ctx.random),
        customer_phone: fakePhone(700 + n),
        notes: o.delivery ? "Please deliver after 6 pm" : null,
        status: "pending",
        wants_delivery: o.delivery,
        delivery_charge: o.delivery ? 30 : 0,
        created_at: new Date(Date.now() - o.hoursAgo * 3600e3).toISOString(),
      })
      .select("id")
      .single();
    if (error || !request) throw new Error(`demo: catalogue order: ${error?.message}`);
    const rows = o.picks.map((idx, k) => {
      const p = products[idx % products.length];
      return { request_id: request.id, product_id: p.id, product_name: p.name, quantity: o.qty[k], price_at_request: p.price };
    });
    const { error: itemError } = await ctx.admin.from("catalog_order_request_items").insert(rows);
    if (itemError) throw new Error(`demo: catalogue order items: ${itemError.message}`);
  }
}

/** "Customer asked for something you did not have": logged so the owner can tell them when it arrives. */
export async function seedItemRequests(ctx: SeedCtx, customers: SeededCustomer[], wanted: { item: string; advance?: number; daysAhead?: number }[]) {
  const rows = wanted.map((w, i) => {
    const c = customers[(i + 2) % customers.length];
    return {
      shop_id: ctx.shopId,
      staff_id: ctx.session.userId,
      customer_id: c.id,
      customer_name: c.name,
      customer_phone: c.phone,
      item_description: w.item,
      advance_amount: w.advance ?? 0,
      expected_date: w.daysAhead ? dateOffset(w.daysAhead) : null,
      status: "pending" as const,
      created_at: isoAt(1 + i, 15, 0),
    };
  });
  const { error } = await ctx.admin.from("item_requests").insert(rows);
  if (error) throw new Error(`demo: item requests: ${error.message}`);
}
