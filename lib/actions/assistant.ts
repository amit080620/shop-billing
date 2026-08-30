"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { buildWhatsAppLink } from "../whatsapp";
import { formatMoney } from "../format";

const MODEL = "gemini-3.5-flash-lite";

/** Every "tool" the assistant can call — each one is a real,
 * hand-written, shop-scoped database query. Gemini never runs SQL or
 * touches Supabase itself; it only ever picks one of THESE, with
 * arguments, and we execute it server-side. This is what keeps this
 * safe: there's no way for a question (however phrased) to reach
 * another shop's data or run an unintended write, because the only
 * things Gemini can trigger are the specific functions defined here
 * — and only ONE of them (prepare_udhar_reminder) produces anything
 * that looks like an "action", and even that only ever hands back a
 * pre-filled WhatsApp link for the OWNER to tap send on — nothing
 * here ever sends a message on its own. */
const TOOL_DECLARATIONS = [
  {
    name: "get_sales_summary",
    description: "Total sales, number of bills, and outstanding udhar collected for a given period.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "yesterday", "week", "month"], description: "Which period to summarize." },
      },
      required: ["period"],
    },
  },
  {
    name: "get_top_items",
    description: "The best-selling products by quantity sold, for a given period.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month"], description: "Which period to look at." },
        limit: { type: "number", description: "How many top items to return, default 5." },
      },
      required: ["period"],
    },
  },
  {
    name: "get_customer_balance",
    description: "A specific customer's current outstanding udhar (credit balance), looked up by name.",
    parameters: {
      type: "object",
      properties: { customerName: { type: "string", description: "The customer's name, or part of it." } },
      required: ["customerName"],
    },
  },
  {
    name: "get_low_stock_items",
    description: "Products currently at or below their low-stock threshold.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_top_customers",
    description: "The customers who have spent the most, for a given period.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month", "all_time"], description: "Which period to look at." },
        limit: { type: "number", description: "How many to return, default 5." },
      },
      required: ["period"],
    },
  },
  {
    name: "find_customers",
    description:
      "Flexible customer search combining multiple conditions at once — e.g. 'customers with udhar over 500 who haven't bought anything in 60 days'. Use this for any compound question that a single fixed tool doesn't cover; leave a filter out entirely if the question doesn't mention it.",
    parameters: {
      type: "object",
      properties: {
        minUdhar: { type: "number", description: "Only customers with outstanding udhar at least this much." },
        inactiveDays: { type: "number", description: "Only customers with no purchase in at least this many days." },
      },
    },
  },
  {
    name: "get_overdue_udhar",
    description: "Customers whose OLDEST unpaid udhar has been outstanding for more than a given number of days — genuinely overdue, not just any balance.",
    parameters: {
      type: "object",
      properties: { minDays: { type: "number", description: "How many days overdue counts as 'overdue', default 14." } },
    },
  },
  {
    name: "prepare_udhar_reminder",
    description:
      "Prepares a WhatsApp reminder for a specific customer's outstanding udhar — use this whenever the person asks to remind, message, or nudge a customer about their balance. Returns a ready-to-send link; it does NOT send anything by itself.",
    parameters: {
      type: "object",
      properties: { customerName: { type: "string", description: "The customer's name, or part of it." } },
      required: ["customerName"],
    },
  },
];

function periodStart(period: string): Date {
  const d = new Date();
  if (period === "today") d.setHours(0, 0, 0, 0);
  else if (period === "yesterday") {
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
  } else if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setDate(d.getDate() - 30);
  else d.setFullYear(2000);
  return d;
}

export type ReminderAction = { label: string; whatsappLink: string };

async function runTool(
  name: string,
  args: Record<string, unknown>,
  shopId: string,
): Promise<{ result: unknown; action?: ReminderAction }> {
  const admin = createSupabaseAdminClient();

  if (name === "get_sales_summary") {
    const period = String(args.period ?? "today");
    const start = periodStart(period);
    let end: Date | undefined;
    if (period === "yesterday") {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    let query = admin.from("bills").select("total, credit_amount").eq("shop_id", shopId).eq("status", "active").gte("created_at", start.toISOString());
    if (end) query = query.lt("created_at", end.toISOString());
    const { data } = await query;
    const totalSales = (data ?? []).reduce((s, b) => s + Number(b.total), 0);
    const totalCredit = (data ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
    return { result: { period, billCount: (data ?? []).length, totalSales: Math.round(totalSales), totalOnUdhar: Math.round(totalCredit) } };
  }

  if (name === "get_top_items") {
    const period = String(args.period ?? "week");
    const limit = Number(args.limit) || 5;
    const start = periodStart(period);
    const { data: bills } = await admin.from("bills").select("id").eq("shop_id", shopId).eq("status", "active").gte("created_at", start.toISOString());
    const billIds = (bills ?? []).map((b) => b.id);
    if (billIds.length === 0) return { result: { period, items: [] } };
    const { data: items } = await admin.from("bill_items").select("product_name, quantity").in("bill_id", billIds);
    const totals = new Map<string, number>();
    for (const item of items ?? []) totals.set(item.product_name, (totals.get(item.product_name) ?? 0) + Number(item.quantity));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return { result: { period, items: ranked.map(([itemName, qty]) => ({ name: itemName, quantitySold: qty })) } };
  }

  if (name === "get_customer_balance") {
    const search = String(args.customerName ?? "").trim();
    if (!search) return { result: { error: "No customer name given" } };
    const { data: customers } = await admin.from("customers").select("id, name, phone").eq("shop_id", shopId).ilike("name", `%${search}%`).limit(5);
    if (!customers || customers.length === 0) return { result: { found: false, searchedFor: search } };

    const results = await Promise.all(
      customers.map(async (c) => {
        const [{ data: bills }, { data: payments }] = await Promise.all([
          admin.from("bills").select("credit_amount").eq("customer_id", c.id).eq("status", "active"),
          admin.from("payments").select("amount").eq("customer_id", c.id),
        ]);
        const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
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
    const period = String(args.period ?? "month");
    const limit = Number(args.limit) || 5;
    let query = admin.from("bills").select("customer_id, total, customers ( name )").eq("shop_id", shopId).eq("status", "active").not("customer_id", "is", null);
    if (period !== "all_time") query = query.gte("created_at", periodStart(period).toISOString());
    const { data } = await query;
    const totals = new Map<string, { name: string; total: number }>();
    for (const b of data ?? []) {
      if (!b.customer_id) continue;
      const custName = Array.isArray(b.customers) ? b.customers[0]?.name : (b.customers as { name: string } | null)?.name;
      const existing = totals.get(b.customer_id) ?? { name: custName ?? "Unknown", total: 0 };
      existing.total += Number(b.total);
      totals.set(b.customer_id, existing);
    }
    const ranked = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
    return { result: { period, customers: ranked.map((c) => ({ name: c.name, totalSpent: Math.round(c.total) })) } };
  }

  // Compound search — this is the one a fixed dashboard widget can
  // never offer, since the exact combination of filters is decided
  // live by whatever the person actually asked, not pre-built.
  if (name === "find_customers") {
    const minUdhar = args.minUdhar !== undefined ? Number(args.minUdhar) : undefined;
    const inactiveDays = args.inactiveDays !== undefined ? Number(args.inactiveDays) : undefined;

    const [{ data: customers }, { data: allBills }, { data: allPayments }] = await Promise.all([
      admin.from("customers").select("id, name, phone").eq("shop_id", shopId),
      admin.from("bills").select("id, customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active"),
      admin.from("payments").select("customer_id, amount").eq("shop_id", shopId),
    ]);

    const cutoff = inactiveDays !== undefined ? new Date(Date.now() - inactiveDays * 86400000) : null;
    const lastPurchaseByCustomer = new Map<string, string>();
    const creditByCustomer = new Map<string, number>();
    for (const b of allBills ?? []) {
      if (!b.customer_id) continue;
      const existing = lastPurchaseByCustomer.get(b.customer_id);
      if (!existing || b.created_at > existing) lastPurchaseByCustomer.set(b.customer_id, b.created_at);
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
    const [{ data: creditBills }, { data: payments }, { data: customers }] = await Promise.all([
      admin.from("bills").select("customer_id, credit_amount, created_at").eq("shop_id", shopId).eq("status", "active").gt("credit_amount", 0),
      admin.from("payments").select("customer_id, amount").eq("shop_id", shopId),
      admin.from("customers").select("id, name, phone").eq("shop_id", shopId),
    ]);
    const nameById = new Map((customers ?? []).map((c) => [c.id, { name: c.name, phone: c.phone }]));
    const creditByCustomer = new Map<string, number>();
    const oldestByCustomer = new Map<string, string>();
    for (const b of creditBills ?? []) {
      if (!b.customer_id) continue;
      creditByCustomer.set(b.customer_id, (creditByCustomer.get(b.customer_id) ?? 0) + Number(b.credit_amount));
      const existing = oldestByCustomer.get(b.customer_id);
      if (!existing || b.created_at < existing) oldestByCustomer.set(b.customer_id, b.created_at);
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
    return { result: { minDays, count: overdue.length, customers: overdue.slice(0, 15).map((c) => ({ name: c.name, outstandingUdhar: Math.round(c.outstanding), daysOld: Math.floor((Date.now() - new Date(c.oldestUnpaidDate).getTime()) / 86400000) })) } };
  }

  // The one genuine "action" tool — everything else only reads. This
  // still never sends anything on its own; it hands back a WhatsApp
  // link pre-filled with the customer's real name and real balance,
  // which the client renders as a tappable button. The owner always
  // makes the final call by tapping it.
  if (name === "prepare_udhar_reminder") {
    const search = String(args.customerName ?? "").trim();
    if (!search) return { result: { error: "No customer name given" } };
    const { data: customer } = await admin.from("customers").select("id, name, phone").eq("shop_id", shopId).ilike("name", `%${search}%`).limit(1).maybeSingle();
    if (!customer) return { result: { found: false, searchedFor: search } };

    const [{ data: bills }, { data: payments }] = await Promise.all([
      admin.from("bills").select("credit_amount").eq("customer_id", customer.id).eq("status", "active"),
      admin.from("payments").select("amount").eq("customer_id", customer.id),
    ]);
    const outstanding = Math.round(
      Math.max(0, (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0) - (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)),
    );
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

export type ChatMessage = { role: "user" | "assistant"; text: string };

const SYSTEM_TEXT = (dateStr: string) =>
  `You are a helpful shop assistant for an Indian small-business owner using "The Ray" billing app. Answer questions about THEIR shop's own sales, customers, and stock — nothing else. Reply in the same language/mix the person used (Hindi, English, or Hinglish). Keep answers short, direct, and genuinely useful — numbers first, no fluff. Money is in Indian Rupees (₹). If a tool call finds nothing relevant, say so plainly rather than guessing. When someone asks to remind/message/nudge a customer, use prepare_udhar_reminder — don't just describe their balance, actually prepare the reminder. For compound questions (multiple conditions combined), use find_customers with all the relevant filters at once rather than making several separate calls. Today's date is ${dateStr}.`;

async function converse(
  contents: unknown[],
  apiKey: string,
  shopId: string,
): Promise<{ answer?: string; action?: ReminderAction; error?: string }> {
  let action: ReminderAction | undefined;
  for (let round = 0; round < 3; round++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_TEXT(new Date().toDateString()) }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!response.ok) {
      console.error("Assistant request failed", response.status, await response.text().catch(() => ""));
      return { error: "Assistant couldn't process that — please try again." };
    }

    const data = await response.json();
    const candidateParts = data?.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = candidateParts.find((p: { functionCall?: unknown }) => p.functionCall);

    if (!functionCallPart) {
      const text = candidateParts.map((p: { text?: string }) => p.text ?? "").join("").trim();
      return { answer: text || "I couldn't find an answer for that — try rephrasing?", action };
    }

    const { name, args } = functionCallPart.functionCall as { name: string; args: Record<string, unknown> };
    const { result, action: toolAction } = await runTool(name, args ?? {}, shopId);
    if (toolAction) action = toolAction;

    contents.push({ role: "model", parts: [{ functionCall: { name, args } }] } as never);
    contents.push({ role: "user", parts: [{ functionResponse: { name, response: result as object } }] } as never);
  }
  return { error: "That took too many steps to answer — try a simpler question." };
}

/** Asks the assistant a question in plain Hindi or English about this
 * shop's own data. Gemini reads the question, decides which tool(s)
 * answer it (including, when asked, actually preparing a reminder),
 * we run those (scoped to this shop only), and Gemini writes the
 * final answer from the real numbers — never from its own guess.
 * Keeps the last few turns of conversation for follow-up questions. */
export async function askAssistantAction(
  question: string,
  history: ChatMessage[],
): Promise<{ answer?: string; action?: ReminderAction; error?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  const contents = [
    ...history.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: question }] },
  ];

  try {
    return await converse(contents, apiKey, session.shopId);
  } catch (err) {
    console.error("Assistant error", err);
    return { error: "Assistant couldn't process that — please try again." };
  }
}

/** Proactive check — called once when the chat is FIRST opened (not
 * on every open; the client caps this to once a day), so the
 * assistant can genuinely notice something worth flagging without
 * being asked, the way an attentive employee would glance at overdue
 * accounts and low stock on their own. Returns null when there's
 * nothing notable, rather than manufacturing a message every time. */
export async function getProactiveBriefingAction(): Promise<{ answer?: string; error?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  try {
    const [{ result: overdue }, { result: lowStock }] = await Promise.all([
      runTool("get_overdue_udhar", { minDays: 14 }, session.shopId),
      runTool("get_low_stock_items", {}, session.shopId),
    ]);

    const overdueCount = (overdue as { count?: number })?.count ?? 0;
    const lowStockCount = (lowStock as { count?: number })?.count ?? 0;
    if (overdueCount === 0 && lowStockCount === 0) return {};

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `Genuinely proactively — no one asked, you're just glancing at today's numbers like a good employee would. Overdue udhar (14+ days): ${JSON.stringify(overdue)}. Low stock: ${JSON.stringify(lowStock)}. Write ONE short, friendly heads-up message (2-3 lines max) mentioning what's genuinely worth their attention. Skip anything with zero count. Don't say "I noticed" or similar filler — just state it plainly.`,
          },
        ],
      },
    ];
    const result = await converse(contents, apiKey, session.shopId);
    return { answer: result.answer };
  } catch (err) {
    console.error("Proactive briefing error", err);
    return {};
  }
}
