"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { buildWhatsAppLink } from "../whatsapp";
import { formatMoney } from "../format";

// Groq hosts genuinely open-source models (Meta's Llama) — this is a
// deliberate choice over Gemini for the assistant specifically: this
// feature is text + function-calling only (no photos to read), which
// is exactly what Groq is fast and generous-free-tier at. The image
// scan features (aiScan.ts) stay on Gemini on purpose — Groq doesn't
// read PDFs natively the way Gemini does, so switching THAT would be
// a genuine downgrade. Right tool for each job, not a blanket swap.
// Groq deprecated llama-3.3-70b-versatile on June 17, 2026 (confirmed
// live) — openai/gpt-oss-120b is their own recommended replacement:
// same OpenAI-compatible function-calling format, comparable quality,
// still on the free tier.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Every "tool" the assistant can call — each one is a real,
 * hand-written, shop-scoped database query. The model never runs SQL
 * or touches Supabase itself; it only ever picks one of THESE, with
 * arguments, and we execute it server-side. This is what keeps this
 * safe: there's no way for a question (however phrased) to reach
 * another shop's data or run an unintended write, because the only
 * things the model can trigger are the specific functions defined
 * here — and only ONE of them (prepare_udhar_reminder) produces
 * anything that looks like an "action", and even that only ever hands
 * back a pre-filled WhatsApp link for the OWNER to tap send on —
 * nothing here ever sends a message on its own. */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Total sales, number of transactions, and outstanding udhar for a period. Covers every sale, whether from the Sell screen, Fast Billing, or a settled restaurant table.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "How many days to look back from today. Convert ANY period the person mentions into this number — 'today'=1, 'yesterday'=2 (look back 2 days to be safe), 'this week'/'last week'/'last 7 days'=7, 'this month'/'last 30 days'=30, 'last 3 days'=3, 'last 45 days'=45, etc. Always a plain number, never a word." },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_items",
      description: "The best-selling products by quantity sold, for a given period.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "How many days to look back — convert any period phrase into a plain number of days (e.g. 'last week'=7, 'last 7 days'=7, 'this month'=30)." },
          limit: { type: "number", description: "How many top items to return, default 5." },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_balance",
      description: "A specific customer's current outstanding udhar (credit balance), looked up by name.",
      parameters: {
        type: "object",
        properties: { customerName: { type: "string", description: "The customer's name, or part of it." } },
        required: ["customerName"],
      },
    },
  },
  {
    type: "function",
    function: { name: "get_low_stock_items", description: "Products currently at or below their low-stock threshold.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "get_top_customers",
      description: "The customers who have spent the most, for a given period.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "How many days to look back — convert any period phrase into a plain number of days. Use 0 for all-time (no date filter)." },
          limit: { type: "number", description: "How many to return, default 5." },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_staff_activity",
      description: "Per-staff-member activity for a period — bill count, total voids, total discount given. Use this for questions about staff behavior, unusual activity, or checking for possible misuse (excessive voids/discounts).",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How many days to look back, default 7 — convert any period phrase into a plain number of days." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_marketing_message",
      description:
        "Writes a ready-to-post WhatsApp Status / marketing message for the shop, based on its real best-selling items and slow-moving stock. Use this whenever the person asks for an offer message, promotional post, or marketing content.",
      parameters: {
        type: "object",
        properties: {
          occasion: { type: "string", description: "The occasion or theme, e.g. 'Diwali sale', 'weekend offer', 'clear old stock' — whatever the person mentioned." },
          discountPercent: { type: "number", description: "Optional discount percentage to mention, if the person said one." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_data_health_check",
      description: "Data-quality issues across the catalog and customer list — missing HSN codes, missing phone numbers, products with no price, products with zero stock threshold. Use this when asked to check for data problems, cleanup needed, or 'is my data okay'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gst_summary",
      description: "GST filing summary for a period — taxable value, CGST, SGST, IGST, and total GST collected. Use this for any GST/tax filing related question.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "How many days to look back, default 30 — convert any period phrase (month/quarter/year/N days) into a plain number of days." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_missing_hsn_bills",
      description: "Products that have been billed without an HSN code — these can cause problems when actually filing GST returns.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_value",
      description: "Total value of all current stock (sum of stock quantity × price across every tracked product) — 'how much is my inventory worth'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Full details for a specific product by name — its price, GST rate, current stock, unit, and whether it has warranty/batch tracking.",
      parameters: {
        type: "object",
        properties: { productName: { type: "string", description: "The product's name, or part of it." } },
        required: ["productName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_payable",
      description: "Total amount owed to vendors/suppliers (unpaid purchases) — overall, or for a specific vendor by name.",
      parameters: {
        type: "object",
        properties: { vendorName: { type: "string", description: "Optional — a specific vendor's name to check, or leave out for the total across all vendors." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_business_overview",
      description:
        "General counts about the shop — total number of customers, total number of products, total number of bills ever, how many products track inventory. Use this for any plain 'how many X do I have' question that isn't specifically about sales, udhar, or stock levels.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_customers",
      description:
        "Flexible customer search combining multiple conditions at once — e.g. 'customers with udhar over 500 who haven't bought anything in 60 days'. Use this for any compound question a single fixed tool doesn't cover; leave a filter out entirely if the question doesn't mention it.",
      parameters: {
        type: "object",
        properties: {
          minUdhar: { type: "number", description: "Only customers with outstanding udhar at least this much." },
          inactiveDays: { type: "number", description: "Only customers with no purchase in at least this many days." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_udhar",
      description: "Customers whose OLDEST unpaid udhar has been outstanding for more than a given number of days — genuinely overdue, not just any balance.",
      parameters: { type: "object", properties: { minDays: { type: "number", description: "How many days overdue counts as 'overdue', default 14." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_udhar_reminder",
      description:
        "Prepares a WhatsApp reminder for a specific customer's outstanding udhar — use this whenever the person asks to remind, message, or nudge a customer about their balance. Returns a ready-to-send link; it does NOT send anything by itself.",
      parameters: {
        type: "object",
        properties: { customerName: { type: "string", description: "The customer's name, or part of it." } },
        required: ["customerName"],
      },
    },
  },
];

/** Genuinely flexible — takes a plain number of days to look back
 * instead of matching against a fixed list of words. This is what
 * lets the model turn ANY period phrase ("last week", "last 7 days",
 * "this month", "last 45 days", "past 3 days") into the SAME simple
 * number, rather than needing to guess which of a few hardcoded
 * strings a request maps to. The model is instructed (system prompt)
 * to always convert the person's words into a day-count itself. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days));
  d.setHours(0, 0, 0, 0);
  return d;
}

type UnifiedSale = { total: number; creditAmount: number; customerId: string | null; id: string; source: "bill" | "restaurant_order" };

/** THE actual fix for "restaurant shops get empty answers" — this
 * shop's real sales live in ONE of two completely separate places
 * depending on business type: `bills` for every non-restaurant flow
 * (Sell screen, Fast Billing), or `restaurant_orders` for dine-in
 * tables settled through the restaurant module. Every sales-related
 * tool below was originally querying `bills` ONLY, which meant a
 * restaurant shop's assistant could never see a single real rupee of
 * their own business. Querying both and merging is the correct fix —
 * not "detect business type and pick one", because a shop could
 * genuinely have both (e.g. a restaurant that also does retail
 * takeaway snacks sold through Fast Billing). */
async function getUnifiedSales(admin: ReturnType<typeof createSupabaseAdminClient>, shopId: string, since: Date): Promise<UnifiedSale[]> {
  const [{ data: bills }, { data: orders }] = await Promise.all([
    admin.from("bills").select("id, total, credit_amount, customer_id").eq("shop_id", shopId).eq("status", "active").gte("created_at", since.toISOString()),
    admin.from("restaurant_orders").select("id, total, credit_amount, customer_id").eq("shop_id", shopId).eq("status", "settled").gte("settled_at", since.toISOString()),
  ]);
  return [
    ...(bills ?? []).map((b) => ({ id: b.id, total: Number(b.total), creditAmount: Number(b.credit_amount), customerId: b.customer_id, source: "bill" as const })),
    ...(orders ?? []).map((o) => ({ id: o.id, total: Number(o.total), creditAmount: Number(o.credit_amount), customerId: o.customer_id, source: "restaurant_order" as const })),
  ];
}

/** Same reasoning as getUnifiedSales, for line-item detail (top
 * sellers, marketing copy) — bill_items and restaurant_order_items
 * are structurally the same shape (product_name, quantity), just two
 * different tables depending on where the sale happened. */
async function getUnifiedItems(admin: ReturnType<typeof createSupabaseAdminClient>, sales: UnifiedSale[]): Promise<{ product_name: string; quantity: number }[]> {
  const billIds = sales.filter((s) => s.source === "bill").map((s) => s.id);
  const orderIds = sales.filter((s) => s.source === "restaurant_order").map((s) => s.id);
  const [{ data: billItems }, { data: orderItems }] = await Promise.all([
    billIds.length ? admin.from("bill_items").select("product_name, quantity").in("bill_id", billIds) : Promise.resolve({ data: [] }),
    orderIds.length ? admin.from("restaurant_order_items").select("product_name, quantity").in("order_id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  return [...(billItems ?? []), ...(orderItems ?? [])];
}

export type ReminderAction = { label: string; whatsappLink: string };

async function runTool(name: string, args: Record<string, unknown>, shopId: string): Promise<{ result: unknown; action?: ReminderAction }> {
  const admin = createSupabaseAdminClient();

  if (name === "get_sales_summary") {
    const days = Number(args.days) || 1;
    const sales = await getUnifiedSales(admin, shopId, daysAgo(days));
    const totalSales = sales.reduce((s, b) => s + b.total, 0);
    const totalCredit = sales.reduce((s, b) => s + b.creditAmount, 0);
    return { result: { days, billCount: sales.length, totalSales: Math.round(totalSales), totalOnUdhar: Math.round(totalCredit) } };
  }

  if (name === "get_top_items") {
    const days = Number(args.days) || 7;
    const limit = Number(args.limit) || 5;
    const sales = await getUnifiedSales(admin, shopId, daysAgo(days));
    if (sales.length === 0) return { result: { days, items: [] } };
    const items = await getUnifiedItems(admin, sales);
    const totals = new Map<string, number>();
    for (const item of items) totals.set(item.product_name, (totals.get(item.product_name) ?? 0) + Number(item.quantity));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return { result: { days, items: ranked.map(([itemName, qty]) => ({ name: itemName, quantitySold: qty })) } };
  }

  if (name === "get_customer_balance") {
    const search = String(args.customerName ?? "").trim();
    if (!search) return { result: { error: "No customer name given" } };
    const { data: customers } = await admin.from("customers").select("id, name, phone").eq("shop_id", shopId).ilike("name", `%${search}%`).limit(5);
    if (!customers || customers.length === 0) return { result: { found: false, searchedFor: search } };

    const results = await Promise.all(
      customers.map(async (c) => {
        const [{ data: bills }, { data: orders }, { data: payments }] = await Promise.all([
          admin.from("bills").select("credit_amount").eq("customer_id", c.id).eq("status", "active"),
          admin.from("restaurant_orders").select("credit_amount").eq("customer_id", c.id).eq("status", "settled"),
          admin.from("payments").select("amount").eq("customer_id", c.id),
        ]);
        const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0) + (orders ?? []).reduce((s, o) => s + Number(o.credit_amount), 0);
        const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
        return { name: c.name, phone: c.phone, outstandingUdhar: Math.round(Math.max(0, totalCredit - totalPaid)) };
      }),
    );
    return { result: { found: true, matches: results } };
  }

  if (name === "get_low_stock_items") {
    const { data } = await admin.from("products").select("name, stock_quantity, low_stock_threshold, unit").eq("shop_id", shopId).eq("track_inventory", true);
    const low = (data ?? []).filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold));
    return { result: { count: low.length, items: low.map((p) => ({ name: p.name, currentStock: p.stock_quantity, unit: p.unit })) } };
  }

  if (name === "get_top_customers") {
    const days = Number(args.days) || 0;
    const limit = Number(args.limit) || 5;
    const since = days > 0 ? daysAgo(days) : new Date(2000, 0, 1);
    const sales = await getUnifiedSales(admin, shopId, since);
    const withCustomer = sales.filter((s) => s.customerId);
    if (withCustomer.length === 0) return { result: { days, customers: [] } };

    const customerIds = [...new Set(withCustomer.map((s) => s.customerId!))];
    const { data: customerRows } = await admin.from("customers").select("id, name").in("id", customerIds);
    const nameById = new Map((customerRows ?? []).map((c) => [c.id, c.name]));

    const totals = new Map<string, { name: string; total: number }>();
    for (const s of withCustomer) {
      const existing = totals.get(s.customerId!) ?? { name: nameById.get(s.customerId!) ?? "Unknown", total: 0 };
      existing.total += s.total;
      totals.set(s.customerId!, existing);
    }
    const ranked = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
    return { result: { days, customers: ranked.map((c) => ({ name: c.name, totalSpent: Math.round(c.total) })) } };
  }

  if (name === "get_staff_activity") {
    const days = Number(args.days) || 7;
    const start = daysAgo(days);
    const [{ data: bills }, { data: orders }, { data: staff }] = await Promise.all([
      admin.from("bills").select("staff_id, status, discount_amount, total").eq("shop_id", shopId).gte("created_at", start.toISOString()),
      admin.from("restaurant_orders").select("staff_id, status, discount_amount, total").eq("shop_id", shopId).gte("created_at", start.toISOString()),
      admin.from("staff").select("id, name").eq("shop_id", shopId),
    ]);
    const nameById = new Map((staff ?? []).map((s) => [s.id, s.name]));
    const byStaff = new Map<string, { bills: number; voids: number; totalDiscount: number; totalSales: number }>();
    for (const b of [...(bills ?? []), ...(orders ?? [])]) {
      const existing = byStaff.get(b.staff_id) ?? { bills: 0, voids: 0, totalDiscount: 0, totalSales: 0 };
      existing.bills += 1;
      if (b.status === "voided" || b.status === "cancelled") existing.voids += 1;
      existing.totalDiscount += Number(b.discount_amount);
      if (b.status === "active" || b.status === "settled") existing.totalSales += Number(b.total);
      byStaff.set(b.staff_id, existing);
    }
    return {
      result: {
        days,
        staff: [...byStaff.entries()].map(([id, s]) => ({
          name: nameById.get(id) ?? "Unknown",
          billCount: s.bills,
          voidCount: s.voids,
          totalDiscountGiven: Math.round(s.totalDiscount),
          totalSales: Math.round(s.totalSales),
        })),
      },
    };
  }

  if (name === "generate_marketing_message") {
    const sales = await getUnifiedSales(admin, shopId, daysAgo(30));
    const items = await getUnifiedItems(admin, sales);
    const soldTotals = new Map<string, number>();
    for (const item of items) soldTotals.set(item.product_name, (soldTotals.get(item.product_name) ?? 0) + Number(item.quantity));
    const ranked = [...soldTotals.entries()].sort((a, b) => b[1] - a[1]);
    const { data: allProducts } = await admin.from("products").select("name").eq("shop_id", shopId).limit(200);
    const soldNames = new Set(ranked.map(([n]) => n));
    const slowMoving = (allProducts ?? []).map((p) => p.name).filter((n) => !soldNames.has(n)).slice(0, 5);

    return {
      result: {
        occasion: args.occasion ?? "general offer",
        discountPercent: args.discountPercent ?? null,
        topSellers: ranked.slice(0, 5).map(([n]) => n),
        slowMovingStock: slowMoving,
        instruction: "Write a short, catchy WhatsApp Status message (2-4 lines, use emojis naturally) promoting this shop's offer, mentioning the top sellers and/or slow-moving stock as relevant.",
      },
    };
  }

  if (name === "get_data_health_check") {
    const [{ data: missingHsn }, { data: noPhone }, { data: zeroPrice }, { data: zeroThreshold }] = await Promise.all([
      admin.from("products").select("name").eq("shop_id", shopId).is("hsn_code", null).limit(20),
      admin.from("customers").select("name").eq("shop_id", shopId).eq("phone", "").limit(20),
      admin.from("products").select("name").eq("shop_id", shopId).eq("price", 0).limit(20),
      admin.from("products").select("name").eq("shop_id", shopId).eq("track_inventory", true).eq("low_stock_threshold", 0).limit(20),
    ]);
    return {
      result: {
        missingHsnCount: missingHsn?.length ?? 0,
        missingHsnExamples: (missingHsn ?? []).slice(0, 5).map((p) => p.name),
        customersWithoutPhoneCount: noPhone?.length ?? 0,
        zeroPriceCount: zeroPrice?.length ?? 0,
        zeroPriceExamples: (zeroPrice ?? []).slice(0, 5).map((p) => p.name),
        noLowStockAlertCount: zeroThreshold?.length ?? 0,
        noLowStockAlertExamples: (zeroThreshold ?? []).slice(0, 5).map((p) => p.name),
      },
    };
  }

  if (name === "get_gst_summary") {
    const days = Number(args.days) || 30;
    const start = daysAgo(days);
    const [{ data: bills }, { data: orders }] = await Promise.all([
      admin.from("bills").select("taxable_amount, cgst_amount, sgst_amount, igst_amount, gst_amount").eq("shop_id", shopId).eq("status", "active").gte("created_at", start.toISOString()),
      admin.from("restaurant_orders").select("taxable_amount, cgst_amount, sgst_amount, igst_amount").eq("shop_id", shopId).eq("status", "settled").gte("settled_at", start.toISOString()),
    ]);
    const rows = [
      ...(bills ?? []).map((b) => ({ taxable: Number(b.taxable_amount), cgst: Number(b.cgst_amount), sgst: Number(b.sgst_amount), igst: Number(b.igst_amount), gst: Number(b.gst_amount) })),
      ...(orders ?? []).map((o) => ({
        taxable: Number(o.taxable_amount),
        cgst: Number(o.cgst_amount),
        sgst: Number(o.sgst_amount),
        igst: Number(o.igst_amount),
        gst: Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount),
      })),
    ];
    const totals = rows.reduce(
      (acc, b) => ({ taxableValue: acc.taxableValue + b.taxable, cgst: acc.cgst + b.cgst, sgst: acc.sgst + b.sgst, igst: acc.igst + b.igst, totalGst: acc.totalGst + b.gst }),
      { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalGst: 0 },
    );
    return {
      result: {
        days,
        billCount: rows.length,
        taxableValue: Math.round(totals.taxableValue),
        cgst: Math.round(totals.cgst),
        sgst: Math.round(totals.sgst),
        igst: Math.round(totals.igst),
        totalGstCollected: Math.round(totals.totalGst),
      },
    };
  }

  if (name === "get_missing_hsn_bills") {
    const { data: products } = await admin.from("products").select("id, name").eq("shop_id", shopId).is("hsn_code", null);
    if (!products || products.length === 0) return { result: { count: 0, products: [] } };
    return { result: { count: products.length, products: products.slice(0, 20).map((p) => p.name) } };
  }

  if (name === "get_inventory_value") {
    const { data } = await admin.from("products").select("stock_quantity, price").eq("shop_id", shopId).eq("track_inventory", true);
    const totalValue = (data ?? []).reduce((s, p) => s + Number(p.stock_quantity) * Number(p.price), 0);
    return { result: { totalValue: Math.round(totalValue), productCount: (data ?? []).length } };
  }

  if (name === "get_product_details") {
    const search = String(args.productName ?? "").trim();
    if (!search) return { result: { error: "No product name given" } };
    const { data: matches } = await admin
      .from("products")
      .select("name, price, gst_percent, stock_quantity, unit, has_warranty, warranty_months, is_pharma, track_inventory")
      .eq("shop_id", shopId)
      .ilike("name", `%${search}%`)
      .limit(5);
    if (!matches || matches.length === 0) return { result: { found: false, searchedFor: search } };
    return {
      result: {
        found: true,
        matches: matches.map((p) => ({
          name: p.name,
          price: Number(p.price),
          gstPercent: Number(p.gst_percent),
          stock: p.track_inventory ? `${p.stock_quantity} ${p.unit}` : "not tracked",
          hasWarranty: p.has_warranty ? `${p.warranty_months} months` : "no",
          batchTracked: p.is_pharma,
        })),
      },
    };
  }

  if (name === "get_vendor_payable") {
    const vendorName = args.vendorName ? String(args.vendorName).trim() : null;
    let vendorFilter: string[] | null = null;
    if (vendorName) {
      const { data: vendors } = await admin.from("vendors").select("id, name").eq("shop_id", shopId).ilike("name", `%${vendorName}%`);
      if (!vendors || vendors.length === 0) return { result: { found: false, searchedFor: vendorName } };
      vendorFilter = vendors.map((v) => v.id);
    }

    let purchaseQuery = admin.from("purchases").select("vendor_id, payable_amount, vendors ( name )").eq("shop_id", shopId);
    if (vendorFilter) purchaseQuery = purchaseQuery.in("vendor_id", vendorFilter);
    const { data: purchases } = await purchaseQuery;

    let paymentQuery = admin.from("purchase_payments").select("vendor_id, amount").eq("shop_id", shopId);
    if (vendorFilter) paymentQuery = paymentQuery.in("vendor_id", vendorFilter);
    const { data: payments } = await paymentQuery;

    const payableByVendor = new Map<string, { name: string; payable: number }>();
    for (const p of purchases ?? []) {
      const vName = Array.isArray(p.vendors) ? p.vendors[0]?.name : (p.vendors as { name: string } | null)?.name;
      const existing = payableByVendor.get(p.vendor_id) ?? { name: vName ?? "Unknown", payable: 0 };
      existing.payable += Number(p.payable_amount);
      payableByVendor.set(p.vendor_id, existing);
    }
    for (const pay of payments ?? []) {
      const existing = payableByVendor.get(pay.vendor_id);
      if (existing) existing.payable -= Number(pay.amount);
    }

    const results = [...payableByVendor.values()].map((v) => ({ vendor: v.name, outstanding: Math.round(Math.max(0, v.payable)) })).filter((v) => v.outstanding > 0);
    const total = results.reduce((s, v) => s + v.outstanding, 0);
    return { result: { totalPayable: total, byVendor: results } };
  }

  if (name === "get_business_overview") {
    const [{ count: customerCount }, { count: productCount }, { count: trackedProductCount }, { count: billCount }, { count: orderCount }] = await Promise.all([
      admin.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      admin.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("track_inventory", true),
      admin.from("bills").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "active"),
      admin.from("restaurant_orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "settled"),
    ]);
    return {
      result: {
        totalCustomers: customerCount ?? 0,
        totalProducts: productCount ?? 0,
        productsWithStockTracking: trackedProductCount ?? 0,
        totalBillsEver: (billCount ?? 0) + (orderCount ?? 0),
      },
    };
  }

  if (name === "find_customers") {
    const minUdhar = args.minUdhar !== undefined ? Number(args.minUdhar) : undefined;
    const inactiveDays = args.inactiveDays !== undefined ? Number(args.inactiveDays) : undefined;

    const [{ data: customers }, { data: allBills }, { data: allOrders }, { data: allPayments }] = await Promise.all([
      admin.from("customers").select("id, name, phone").eq("shop_id", shopId),
      admin.from("bills").select("id, customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active"),
      admin.from("restaurant_orders").select("id, customer_id, credit_amount, settled_at").eq("shop_id", shopId).eq("status", "settled"),
      admin.from("payments").select("customer_id, amount").eq("shop_id", shopId),
    ]);

    const cutoff = inactiveDays !== undefined ? new Date(Date.now() - inactiveDays * 86400000) : null;
    const lastPurchaseByCustomer = new Map<string, string>();
    const creditByCustomer = new Map<string, number>();
    for (const b of [...(allBills ?? []).map((b) => ({ customer_id: b.customer_id, credit_amount: b.credit_amount, at: b.created_at })), ...(allOrders ?? []).map((o) => ({ customer_id: o.customer_id, credit_amount: o.credit_amount, at: o.settled_at ?? "" }))]) {
      if (!b.customer_id) continue;
      const existing = lastPurchaseByCustomer.get(b.customer_id);
      if (!existing || b.at > existing) lastPurchaseByCustomer.set(b.customer_id, b.at);
      creditByCustomer.set(b.customer_id, (creditByCustomer.get(b.customer_id) ?? 0) + Number(b.credit_amount));
    }
    const paidByCustomer = new Map<string, number>();
    for (const p of allPayments ?? []) {
      if (!p.customer_id) continue;
      paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
    }

    const matches = (customers ?? [])
      .map((c) => {
        const outstanding = Math.max(0, (creditByCustomer.get(c.id) ?? 0) - (paidByCustomer.get(c.id) ?? 0));
        const lastPurchase = lastPurchaseByCustomer.get(c.id) ?? null;
        return { name: c.name, phone: c.phone, outstandingUdhar: Math.round(outstanding), lastPurchase };
      })
      .filter((c) => (minUdhar === undefined || c.outstandingUdhar >= minUdhar) && (cutoff === null || !c.lastPurchase || c.lastPurchase < cutoff.toISOString()));

    return { result: { filters: { minUdhar, inactiveDays }, count: matches.length, customers: matches.slice(0, 25) } };
  }

  if (name === "get_overdue_udhar") {
    const minDays = Number(args.minDays) || 14;
    const cutoff = new Date(Date.now() - minDays * 86400000);
    const [{ data: creditBills }, { data: creditOrders }, { data: payments }, { data: customers }] = await Promise.all([
      admin.from("bills").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active").gt("credit_amount", 0),
      admin.from("restaurant_orders").select("customer_id, credit_amount, settled_at").eq("shop_id", shopId).eq("status", "settled").gt("credit_amount", 0),
      admin.from("payments").select("customer_id, amount").eq("shop_id", shopId),
      admin.from("customers").select("id, name, phone").eq("shop_id", shopId),
    ]);
    const nameById = new Map((customers ?? []).map((c) => [c.id, { name: c.name, phone: c.phone }]));
    const creditByCustomer = new Map<string, number>();
    const oldestByCustomer = new Map<string, string>();
    for (const b of [
      ...(creditBills ?? []).map((b) => ({ customer_id: b.customer_id, credit_amount: b.credit_amount, at: b.created_at })),
      ...(creditOrders ?? []).map((o) => ({ customer_id: o.customer_id, credit_amount: o.credit_amount, at: o.settled_at ?? "" })),
    ]) {
      if (!b.customer_id) continue;
      creditByCustomer.set(b.customer_id, (creditByCustomer.get(b.customer_id) ?? 0) + Number(b.credit_amount));
      const existing = oldestByCustomer.get(b.customer_id);
      if (!existing || b.at < existing) oldestByCustomer.set(b.customer_id, b.at);
    }
    const paidByCustomer = new Map<string, number>();
    for (const p of payments ?? []) {
      if (!p.customer_id) continue;
      paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + Number(p.amount));
    }
    const overdue = [...creditByCustomer.entries()]
      .map(([customerId, credit]) => {
        const outstanding = Math.max(0, credit - (paidByCustomer.get(customerId) ?? 0));
        const oldest = oldestByCustomer.get(customerId)!;
        return { customerId, name: nameById.get(customerId)?.name ?? "Unknown", phone: nameById.get(customerId)?.phone, outstanding, oldestUnpaidDate: oldest };
      })
      .filter((c) => c.outstanding > 0 && c.oldestUnpaidDate < cutoff.toISOString())
      .sort((a, b) => b.outstanding - a.outstanding);
    return {
      result: {
        minDays,
        count: overdue.length,
        customers: overdue.slice(0, 15).map((c) => ({ name: c.name, outstandingUdhar: Math.round(c.outstanding), daysOld: Math.floor((Date.now() - new Date(c.oldestUnpaidDate).getTime()) / 86400000) })),
      },
    };
  }

  if (name === "prepare_udhar_reminder") {
    const search = String(args.customerName ?? "").trim();
    if (!search) return { result: { error: "No customer name given" } };
    const { data: customer } = await admin.from("customers").select("id, name, phone").eq("shop_id", shopId).ilike("name", `%${search}%`).limit(1).maybeSingle();
    if (!customer) return { result: { found: false, searchedFor: search } };

    const [{ data: bills }, { data: payments }] = await Promise.all([
      admin.from("bills").select("credit_amount").eq("customer_id", customer.id).eq("status", "active"),
      admin.from("payments").select("amount").eq("customer_id", customer.id),
    ]);
    const outstanding = Math.round(Math.max(0, (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0) - (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)));
    if (outstanding <= 0) return { result: { name: customer.name, outstandingUdhar: 0, note: "No outstanding balance — nothing to remind about." } };
    if (!customer.phone) return { result: { name: customer.name, outstandingUdhar: outstanding, note: "No phone number on file — can't prepare a WhatsApp reminder." } };

    const message = `Namaste ${customer.name}, aapka ${formatMoney(outstanding)} ka udhar pending hai. Jab convenient ho, clear kar dijiyega. Dhanyavaad!`;
    return {
      result: { name: customer.name, outstandingUdhar: outstanding, reminderPrepared: true },
      action: { label: `Send reminder to ${customer.name} (${formatMoney(outstanding)})`, whatsappLink: buildWhatsAppLink(customer.phone, message) },
    };
  }

  return { result: { error: `Unknown tool: ${name}` } };
}

export type AssistantStatus = "connected" | "not_configured" | "quota_exceeded" | "invalid_key" | "network_error";

/** Cheap connectivity check for Groq — same reasoning as Gemini's
 * checkAIScanStatusAction: a tiny "reply with one word" call, not a
 * real question, so the badge costs nothing meaningful against the
 * free tier even checked often. */
export async function checkAssistantStatusAction(): Promise<{ status: AssistantStatus }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { status: "not_configured" };

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: "Reply with just the word OK." }], max_tokens: 5 }),
    });
    if (response.ok) return { status: "connected" };
    console.error("Assistant status check failed", response.status, await response.text().catch(() => "(no body)"));
    if (response.status === 429) return { status: "quota_exceeded" };
    if (response.status === 401 || response.status === 403) return { status: "invalid_key" };
    return { status: "network_error" };
  } catch (err) {
    console.error("Assistant status check — request itself failed", err);
    return { status: "network_error" };
  }
}

export type ChatMessage = { role: "user" | "assistant"; text: string };

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

const SYSTEM_TEXT = (dateStr: string) =>
  `You are a helpful shop assistant for an Indian small-business owner using "The Ray" billing app. You have real, live access to THIS shop's own data — sales, customers, products, stock, and transactions (including restaurant orders, if this is a restaurant) — through the tools provided. Never say you don't have access to the data; if a question is about the shop's own business, use the right tool. For any plain "how many customers/products/bills do I have" question, use get_business_overview. Answer questions about THEIR shop's own data — nothing outside it. Reply in the same language/mix the person used (Hindi, English, or Hinglish). Keep answers short, direct, and genuinely useful — numbers first, no fluff. Money is in Indian Rupees (₹). If a tool call finds nothing relevant, say so plainly rather than guessing.

Time periods: several tools take a "days" parameter — a PLAIN NUMBER, never a word. Always convert whatever period the person mentions yourself: "today"→1, "yesterday"→2, "this week"/"last week"/"last 7 days"/"past week"→7, "this month"/"last month"/"last 30 days"→30, "last 3 days"→3, "last 45 days"→45, "this quarter"/"last 90 days"→90, "this year"/"last year"→365. If they give an exact number of days in any phrasing, use that exact number — never round it to the nearest word you know.

When someone asks to remind/message/nudge a customer, use prepare_udhar_reminder — don't just describe their balance, actually prepare the reminder. For compound questions (multiple conditions combined), use find_customers with all the relevant filters at once rather than making several separate calls. Today's date is ${dateStr}.`;

async function converse(messages: GroqMessage[], apiKey: string, shopId: string): Promise<{ answer?: string; action?: ReminderAction; error?: string }> {
  let action: ReminderAction | undefined;
  for (let round = 0; round < 3; round++) {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, tools: TOOLS, temperature: 0.2 }),
    });

    if (!response.ok) {
      console.error("Assistant request failed", response.status, await response.text().catch(() => ""));
      return { error: "Assistant couldn't process that — please try again." };
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const toolCalls: { id: string; function: { name: string; arguments: string } }[] = message?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      const text = String(message?.content ?? "").trim();
      return { answer: text || "I couldn't find an answer for that — try rephrasing?", action };
    }

    // Groq (OpenAI-compatible) can request several tool calls in one
    // turn — handle all of them before going back to the model.
    messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function", function: tc.function })) });
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed arguments — treat as empty, the tool itself validates what it needs
      }
      const { result, action: toolAction } = await runTool(call.function.name, args, shopId);
      if (toolAction) action = toolAction;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { error: "That took too many steps to answer — try a simpler question." };
}

/** Asks the assistant a question in plain Hindi or English about this
 * shop's own data. The model reads the question, decides which
 * tool(s) answer it (including, when asked, actually preparing a
 * reminder), we run those (scoped to this shop only), and the model
 * writes the final answer from the real numbers — never from its own
 * guess. Keeps the last few turns of conversation for follow-ups. */
export async function askAssistantAction(question: string, history: ChatMessage[]): Promise<{ answer?: string; action?: ReminderAction; error?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_TEXT(new Date().toDateString()) },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.text }) as GroqMessage),
    { role: "user", content: question },
  ];

  try {
    return await converse(messages, apiKey, session.shopId);
  } catch (err) {
    console.error("Assistant error", err);
    return { error: "Assistant couldn't process that — please try again." };
  }
}

/** The actual briefing computation — genuinely shop-scoped by ID, not
 * by session, so this same function works both from a live request
 * (session available) AND from the overnight cron job (no session,
 * just iterating every shop's ID). Used by getProactiveBriefingAction
 * (live fallback) and the cron route (the real overnight run) so
 * there's exactly one place this logic lives. */
export async function computeBriefing(shopId: string, apiKey: string): Promise<{ message: string | null; overdueCount: number; lowStockCount: number }> {
  const [{ result: overdue }, { result: lowStock }, { result: staffActivity }] = await Promise.all([
    runTool("get_overdue_udhar", { minDays: 14 }, shopId),
    runTool("get_low_stock_items", {}, shopId),
    runTool("get_staff_activity", { days: 7 }, shopId),
  ]);

  const overdueCount = (overdue as { count?: number })?.count ?? 0;
  const lowStockCount = (lowStock as { count?: number })?.count ?? 0;
  // A genuinely simple anomaly signal — 3+ voids in a week is unusual
  // for most small shops. Not a fraud accusation, just worth a glance.
  const staffList = (staffActivity as { staff?: { name: string; voidCount: number }[] })?.staff ?? [];
  const flaggedStaff = staffList.filter((s) => s.voidCount >= 3);

  if (overdueCount === 0 && lowStockCount === 0 && flaggedStaff.length === 0) return { message: null, overdueCount, lowStockCount };

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_TEXT(new Date().toDateString()) },
    {
      role: "user",
      content: `Genuinely proactively — no one asked, you're just glancing at today's numbers like a good employee would. Overdue udhar (14+ days): ${JSON.stringify(overdue)}. Low stock: ${JSON.stringify(lowStock)}. Staff with unusually high voids this week (3+): ${JSON.stringify(flaggedStaff)}. Write ONE short, friendly heads-up message (2-4 lines max) mentioning what's genuinely worth their attention. Skip anything with zero/empty results. For the staff void flag, phrase it neutrally as worth checking, not an accusation. Don't say "I noticed" or similar filler — just state it plainly.`,
    },
  ];
  const result = await converse(messages, apiKey, shopId);
  return { message: result.answer ?? null, overdueCount, lowStockCount };
}

/** Proactive check — called once when the chat is FIRST opened (not
 * on every open; the client caps this to once a day), so the
 * assistant can genuinely notice something worth flagging without
 * being asked. Checks the overnight cron's pre-computed result FIRST
 * (instant, no waiting) — only falls back to computing it live if the
 * cron hasn't run yet for today. Returns null when there's nothing
 * notable. */
export async function getProactiveBriefingAction(): Promise<{ answer?: string; error?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  try {
    const admin = createSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data: cached } = await admin.from("daily_briefings").select("message").eq("shop_id", session.shopId).eq("briefing_date", today).maybeSingle();
    if (cached) return { answer: cached.message ?? undefined };

    const { message } = await computeBriefing(session.shopId, apiKey);
    return { answer: message ?? undefined };
  } catch (err) {
    console.error("Proactive briefing error", err);
    return {};
  }
}
