import { setTodaysMetalRateAction } from "@/lib/actions/jewellery";
import { dateOffset } from "../util";
import type { Catalog } from "./catalogs";
import { insertCatalog, insertCustomers, insertVendors, seedBills, seedPettyCash, seedPurchases, seedUdhaarPayments, STANDARD_PETTY_CASH, type SeedCtx } from "./common";

const GOLD_RATE = 7420; // per gram, 22K, made-up
const SILVER_RATE = 94;

const STOCK: Catalog = [
  {
    category: "Coins & Bars",
    items: [
      { name: "Gold Coin 2g (24K)", price: 15900, gst: 3, hsn: "7118", unit: "NOS", stock: 12, low: 3, metal: { type: "gold", purity: "24K", making: ["flat", 350], hallmark: "HUID-A1B2C3" } },
      { name: "Gold Coin 5g (24K)", price: 38600, gst: 3, hsn: "7118", unit: "NOS", stock: 8, low: 2, metal: { type: "gold", purity: "24K", making: ["flat", 600], hallmark: "HUID-D4E5F6" } },
      { name: "Silver Coin 10g", price: 1050, gst: 3, hsn: "7118", unit: "NOS", stock: 40, low: 8, metal: { type: "silver", purity: "999", making: ["flat", 60] } },
      { name: "Silver Bar 100g", price: 9700, gst: 3, hsn: "7106", unit: "NOS", stock: 10, low: 2, metal: { type: "silver", purity: "999", making: ["flat", 200] } },
    ],
  },
  {
    category: "Silver articles",
    items: [
      { name: "Silver Pooja Thali Set", price: 6800, gst: 3, hsn: "7114", unit: "SET", stock: 6, low: 2, metal: { type: "silver", purity: "925", making: ["percent", 12] } },
      { name: "Silver Payal (pair, 60g)", price: 6100, gst: 3, hsn: "7113", unit: "PAIR", stock: 14, low: 3, metal: { type: "silver", purity: "925", making: ["per_gram", 8] } },
      { name: "Silver Glass & Plate Set", price: 5400, gst: 3, hsn: "7114", unit: "SET", stock: 5, low: 2, metal: { type: "silver", purity: "925", making: ["percent", 10] } },
    ],
  },
  {
    category: "Imitation & Accessories",
    items: [
      { name: "Oxidised Jhumka Earrings", price: 350, gst: 3, hsn: "7117", unit: "PAIR", stock: 60, low: 10 },
      { name: "Gold-plated Bangles (set of 4)", price: 850, gst: 3, hsn: "7117", unit: "SET", stock: 30, low: 6 },
      { name: "Jewellery Box (velvet)", price: 450, gst: 18, hsn: "4202", unit: "NOS", stock: 25, low: 5 },
    ],
  },
];

/** Pieces made to order or picked from the counter, priced by weight on the day. */
const PIECES: { name: string; metal: "gold" | "silver"; purity: string; grams: [number, number]; making: number; wastage: number }[] = [
  { name: "Gold Chain 22K", metal: "gold", purity: "22K", grams: [8, 22], making: 520, wastage: 8 },
  { name: "Gold Ring 22K", metal: "gold", purity: "22K", grams: [3, 7], making: 600, wastage: 9 },
  { name: "Gold Bangles (pair) 22K", metal: "gold", purity: "22K", grams: [20, 42], making: 480, wastage: 8 },
  { name: "Gold Mangalsutra 22K", metal: "gold", purity: "22K", grams: [10, 24], making: 650, wastage: 10 },
  { name: "Gold Earrings 22K", metal: "gold", purity: "22K", grams: [4, 10], making: 700, wastage: 9 },
  { name: "Gold Necklace Set 22K", metal: "gold", purity: "22K", grams: [30, 65], making: 560, wastage: 9 },
  { name: "Silver Anklet 925", metal: "silver", purity: "925", grams: [40, 90], making: 9, wastage: 6 },
  { name: "Silver Bracelet 925", metal: "silver", purity: "925", grams: [15, 35], making: 12, wastage: 6 },
];

export async function seedJewellery(ctx: SeedCtx): Promise<void> {
  // Rates change a little every day; today's is set through the app itself.
  const goldRates = Array.from({ length: 30 }, (_, i) => ({ shop_id: ctx.shopId, metal_type: "gold" as const, rate_per_gram: GOLD_RATE - 120 + ((i * 37) % 260), effective_date: dateOffset(-(29 - i)) }));
  const silverRates = Array.from({ length: 30 }, (_, i) => ({ shop_id: ctx.shopId, metal_type: "silver" as const, rate_per_gram: SILVER_RATE - 3 + ((i * 11) % 8), effective_date: dateOffset(-(29 - i)) }));
  await ctx.admin.from("metal_rates").insert([...goldRates.slice(0, 29), ...silverRates.slice(0, 29)]);
  await setTodaysMetalRateAction("gold", GOLD_RATE);
  await setTodaysMetalRateAction("silver", SILVER_RATE);

  const products = await insertCatalog(ctx, STOCK);
  const customers = await insertCustomers(ctx, 18, { withGstin: 1, otherState: 0 });
  const vendors = await insertVendors(ctx, [{ name: "Zaveri Bazaar Bullion" }, { name: "Rajkot Gold Works" }]);
  await seedPurchases(ctx, vendors, products, [{ daysAgo: 21, vendorIndex: 0, productIndexes: [0, 1, 2, 3], qty: 6, paidShare: 1 }]);

  // Sales: mostly pieces priced by weight (metal value + wastage + making), some coins and articles.
  await seedBills(ctx, products, customers, {
    count: 40,
    days: 30,
    itemsPerBill: [1, 1],
    qty: [1, 1],
    customerShare: 0.85,
    udhaarShare: 0.2,
    peakHours: [11, 12, 13, 16, 17, 18, 19, 20],
    decorate: (bill, index) => {
      if (index % 4 === 3) return bill; // every fourth bill is a coin or article from stock
      const piece = PIECES[index % PIECES.length];
      const rate = piece.metal === "gold" ? GOLD_RATE : SILVER_RATE;
      const grams = Math.round((piece.grams[0] + ((index * 7) % (piece.grams[1] - piece.grams[0] + 1)) + (index % 10) / 10) * 100) / 100;
      const metalValue = grams * rate;
      const wastage = (metalValue * piece.wastage) / 100;
      const making = piece.metal === "gold" ? grams * piece.making : grams * piece.making;
      const total = Math.round((metalValue + wastage + making) * 100) / 100;
      const huid = piece.metal === "gold" ? ` (HUID: ${["AB12CD", "EF34GH", "JK56LM", "NP78QR"][index % 4]}${String(100 + index)})` : "";
      const base = { ...bill, items: [{ productId: null, description: `${piece.name} ${grams}g${huid}`, quantity: 1, unitPrice: total, gstPercent: 3 }] };
      // Some customers trade in old gold, which reduces what they pay.
      if (piece.metal === "gold" && index % 3 === 0) {
        const grossWeight = Math.round((4 + (index % 9)) * 100) / 100;
        const purity = 91.6;
        const oldRate = GOLD_RATE - 200;
        return {
          ...base,
          exchangeMetal: "gold" as const,
          exchangeDescription: "Old gold chain and earrings",
          exchangeGrossWeight: grossWeight,
          exchangePurityPercent: purity,
          exchangeRatePerGram: oldRate,
          exchangeValue: Math.round(grossWeight * (purity / 100) * oldRate * 100) / 100,
        };
      }
      return base;
    },
  });
  await seedUdhaarPayments(ctx, customers);
  await seedPettyCash(ctx, [{ description: "Showcase lighting repair", amount: 1400, category: "Maintenance", daysAgo: 7 }, { description: "Insurance instalment", amount: 5200, category: "Insurance", daysAgo: 12 }, ...STANDARD_PETTY_CASH.slice(0, 3)]);
}
