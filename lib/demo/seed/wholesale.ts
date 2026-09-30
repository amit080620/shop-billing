import { createPurchaseAction } from "@/lib/actions/purchases";
import { saveQuotationAction } from "@/lib/actions/quotations";
import { createChallanAction } from "@/lib/actions/challans";
import { addDays } from "@/lib/hotel/dates";
import { dateOffset, fakePhone, formData, isoAt, todayIst } from "../util";
import type { Catalog } from "./catalogs";
import { ignoreRedirect, insertCatalog, insertVendors, seedBills, seedPettyCash, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx, type SeededCustomer } from "./common";

/** An FMCG distributor's list: retail rate (price), wholesale rate, MRP, the pack and, for some, the
 * scheme the shop passes on to parties. Prices include GST. */
type WsItem = { name: string; mrp: number; price: number; wholesale: number; gst: number; hsn: string; unit: string; stock: number; low: number; pack?: [units: number, loose: string]; scheme?: [buy: number, free: number] };

const ITEMS: { category: string; items: WsItem[] }[] = [
  {
    category: "Biscuits & Snacks",
    items: [
      { name: "Parle-G 250g (box of 24)", mrp: 720, price: 650, wholesale: 620, gst: 18, hsn: "1905", unit: "BOX", stock: 140, low: 30, pack: [24, "packet"] },
      { name: "Good Day Cashew 100g (box of 36)", mrp: 1080, price: 960, wholesale: 915, gst: 18, hsn: "1905", unit: "BOX", stock: 60, low: 15, pack: [36, "packet"] },
      { name: "Kurkure Masala Munch 90g (box of 20)", mrp: 400, price: 360, wholesale: 344, gst: 12, hsn: "2106", unit: "BOX", stock: 80, low: 20, pack: [20, "packet"] },
      { name: "Maggi Masala 70g (case of 96)", mrp: 1344, price: 1215, wholesale: 1168, gst: 12, hsn: "1902", unit: "CTN", stock: 45, low: 10, pack: [96, "packet"], scheme: [10, 1] },
    ],
  },
  {
    category: "Tea, Coffee & Drinks",
    items: [
      { name: "Tata Tea Premium 1kg", mrp: 560, price: 505, wholesale: 488, gst: 5, hsn: "0902", unit: "PKT", stock: 90, low: 20 },
      { name: "Nescafe Classic 50g", mrp: 185, price: 164, wholesale: 156, gst: 18, hsn: "2101", unit: "NOS", stock: 120, low: 25 },
      { name: "Frooti 160ml (case of 40)", mrp: 400, price: 356, wholesale: 340, gst: 12, hsn: "2202", unit: "CTN", stock: 50, low: 12, pack: [40, "tetra"] },
    ],
  },
  {
    category: "Soaps & Personal care",
    items: [
      { name: "Lux Soap 100g (pack of 4)", mrp: 140, price: 124, wholesale: 118, gst: 18, hsn: "3401", unit: "PKT", stock: 300, low: 60, scheme: [10, 2] },
      { name: "Colgate Strong Teeth 200g", mrp: 125, price: 110, wholesale: 104, gst: 18, hsn: "3306", unit: "NOS", stock: 260, low: 50, scheme: [12, 1] },
      { name: "Vim Bar 300g", mrp: 40, price: 35, wholesale: 33, gst: 18, hsn: "3402", unit: "NOS", stock: 500, low: 100, scheme: [10, 2] },
      { name: "Clinic Plus Shampoo 175ml", mrp: 150, price: 133, wholesale: 126, gst: 18, hsn: "3305", unit: "NOS", stock: 150, low: 30 },
    ],
  },
  {
    category: "Staples",
    items: [
      { name: "Fortune Sunflower Oil 1L", mrp: 175, price: 158, wholesale: 152, gst: 5, hsn: "1512", unit: "PKT", stock: 240, low: 50 },
      { name: "Tata Salt 1kg", mrp: 28, price: 25, wholesale: 24, gst: 5, hsn: "2501", unit: "PKT", stock: 600, low: 120, scheme: [20, 1] },
      { name: "Aashirvaad Atta 5kg", mrp: 290, price: 262, wholesale: 252, gst: 5, hsn: "1101", unit: "BAG", stock: 160, low: 40 },
    ],
  },
];

/** Retailers the distributor supplies, on four beats. [name, GSTIN?, rate level, credit days, beat] */
const PARTIES: [string, boolean, "retail" | "wholesale", number, string][] = [
  ["Sai Kirana Stores", true, "wholesale", 15, "Monday – Market Yard"],
  ["Om General Store", false, "retail", 7, "Monday – Market Yard"],
  ["Shree Balaji Supermart", true, "wholesale", 30, "Tuesday – Station Road"],
  ["Laxmi Provision", false, "retail", 7, "Tuesday – Station Road"],
  ["Gurukrupa Traders", true, "wholesale", 21, "Wednesday – MIDC"],
  ["New Mahalaxmi Kirana", false, "retail", 7, "Wednesday – MIDC"],
  ["Jai Bhavani Stores", false, "retail", 10, "Thursday – Old City"],
  ["Patil Brothers Mart", true, "wholesale", 30, "Thursday – Old City"],
  ["Anand Medical & General", false, "retail", 15, "Thursday – Old City"],
  ["City Fresh Mini Mart", true, "wholesale", 15, "Tuesday – Station Road"],
];

export async function seedWholesale(ctx: SeedCtx): Promise<void> {
  const { admin, shopId } = ctx;
  const catalog: Catalog = ITEMS.map((g) => ({ category: g.category, items: g.items.map((i) => ({ name: i.name, price: i.price, gst: i.gst, hsn: i.hsn, unit: i.unit, mrp: i.mrp, stock: i.stock, low: i.low })) }));
  const products = await insertCatalog(ctx, catalog);
  const spec = new Map(ITEMS.flatMap((g) => g.items).map((i) => [i.name, i]));
  // Wholesale rate, pack size and scheme — the columns the retail catalogue doesn't have.
  for (const p of products) {
    const s = spec.get(p.name)!;
    await admin
      .from("products")
      .update({ wholesale_price: s.wholesale, units_per_pack: s.pack?.[0] ?? null, loose_unit_name: s.pack?.[1] ?? null, bxgy_buy: s.scheme?.[0] ?? null, bxgy_free: s.scheme?.[1] ?? null })
      .eq("id", p.id);
  }

  const home = ctx.session.shopStateCode ?? "27";
  const { data: parties } = await admin
    .from("customers")
    .insert(
      PARTIES.map(([name, gst, level, days, beat], i) => ({
        shop_id: shopId,
        name,
        phone: fakePhone(40 + i),
        gstin: gst ? `${home}AABC${String.fromCharCode(65 + i)}${1000 + i * 7}${String.fromCharCode(70 + i)}1Z${i}` : null,
        address: `Shop ${i + 3}, ${beat.split("– ")[1]}, Pune 4110${String(10 + i * 3).padStart(2, "0")}`,
        state_code: home,
        price_level: level,
        credit_days: days,
        beat,
      })),
    )
    .select("id, name, phone");
  const customers: SeededCustomer[] = (parties ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "" }));

  const vendors = await insertVendors(ctx, [{ name: "Parle Products C&F Agent" }, { name: "HUL Super Stockist" }, { name: "Nestle & Tata Consumer Distributor" }]);
  // Company purchases, a few with the company's free goods ("10 + 5").
  const byName = (n: string) => products.find((p) => p.name === n)!;
  const buys: [string, number, number, number, number][] = [
    // item, vendor, quantity, free, days ago
    ["Vim Bar 300g", 1, 200, 100, 26],
    ["Lux Soap 100g (pack of 4)", 1, 120, 60, 24],
    ["Colgate Strong Teeth 200g", 1, 96, 24, 22],
    ["Parle-G 250g (box of 24)", 0, 60, 6, 20],
    ["Maggi Masala 70g (case of 96)", 2, 30, 3, 18],
    ["Tata Salt 1kg", 2, 400, 20, 15],
    ["Tata Tea Premium 1kg", 2, 60, 0, 12],
    ["Fortune Sunflower Oil 1L", 2, 120, 0, 9],
  ];
  let n = 1;
  for (const [name, v, qty, free, daysAgo] of buys) {
    const p = byName(name);
    const cost = Math.round((spec.get(name)!.wholesale / (1 + p.gst / 100)) * 0.88 * 100) / 100;
    const payload = {
      vendorId: vendors[v].id,
      vendorInvoiceNumber: `${vendors[v].name.slice(0, 3).toUpperCase()}/${5100 + n++}`,
      purchaseDate: dateOffset(-daysAgo),
      items: [{ productId: p.id, description: p.name, quantity: qty, freeQuantity: free || undefined, unitPrice: cost, gstPercent: p.gst }],
      paidAmount: 0,
      paymentMethod: "upi",
      itcEligible: true,
      reverseCharge: false,
    };
    await ignoreRedirect(() => createPurchaseAction(null, formData({ payload: JSON.stringify(payload) })));
  }
  const { data: purchases } = await admin.from("purchases").select("id, purchase_date").eq("shop_id", shopId);
  for (const row of purchases ?? []) await admin.from("purchases").update({ created_at: `${row.purchase_date}T11:00:00+05:30` }).eq("id", row.id);

  // A month of bills to parties — mostly on credit, in trade quantities (the schemes kick in).
  await seedBills(ctx, products, customers, {
    count: 46,
    days: 45,
    itemsPerBill: [2, 5],
    qty: [6, 24],
    customerShare: 1,
    udhaarShare: 0.62,
    peakHours: [10, 11, 12, 15, 16, 17, 18],
  });
  // Bills were moved back to their own days: each credit bill's due date follows its date.
  const terms = new Map(PARTIES.map(([name, , , days]) => [name, days]));
  const { data: bills } = await admin.from("bills").select("id, created_at, credit_amount, customer_id").eq("shop_id", shopId).gt("credit_amount", 0);
  const nameOf = new Map(customers.map((c) => [c.id, c.name]));
  for (const b of bills ?? []) {
    const days = terms.get(nameOf.get(b.customer_id ?? "") ?? "") ?? 15;
    const date = new Date(b.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await admin.from("bills").update({ due_date: addDays(date, days) }).eq("id", b.id);
  }
  await seedUdhaarPayments(ctx, customers);

  // The salesman's orders from today's beat, waiting to be billed.
  const orderLines = (items: [string, number][]) => items.map(([name, qty]) => ({ productId: byName(name).id, description: name, quantity: qty, unitPrice: byName(name).price, gstPercent: byName(name).gst }));
  const orders: [number, [string, number][]][] = [
    [0, [["Parle-G 250g (box of 24)", 5], ["Vim Bar 300g", 24], ["Tata Salt 1kg", 42]]],
    [1, [["Lux Soap 100g (pack of 4)", 12], ["Colgate Strong Teeth 200g", 13]]],
    [2, [["Maggi Masala 70g (case of 96)", 11], ["Tata Tea Premium 1kg", 10], ["Fortune Sunflower Oil 1L", 20]]],
    [7, [["Aashirvaad Atta 5kg", 25], ["Kurkure Masala Munch 90g (box of 20)", 6]]],
  ];
  for (const [who, items] of orders) {
    await saveQuotationAction(JSON.stringify({ customerId: customers[who].id, items: orderLines(items), discountType: "flat", discountValue: 0, paidAmount: 0, paymentMethod: "cash" }), 0, "", "order");
  }
  const { data: made } = await admin.from("quotations").select("id").eq("shop_id", shopId).eq("kind", "order");
  for (const [i, o] of (made ?? []).entries()) await admin.from("quotations").update({ created_at: isoAt(0, 9 + i, 15) }).eq("id", o.id);

  // Goods out on a challan, to be billed at month end.
  await createChallanAction({ customerId: customers[4].id, customerName: customers[4].name, customerPhone: customers[4].phone, date: todayIst(), site: "", vehicle: "MH12 TW 4410", notes: "", takeStock: true, items: [{ productId: byName("Fortune Sunflower Oil 1L").id, name: "Fortune Sunflower Oil 1L", unit: "PKT", quantity: 40 }] });


  await seedPettyCash(ctx, STANDARD_PETTY_CASH);
}
