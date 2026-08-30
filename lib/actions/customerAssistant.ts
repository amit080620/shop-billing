"use server";

import { createSupabaseAdminClient } from "../supabase/admin";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Deliberately a MUCH smaller, harder-scoped toolset than the shop
 * owner's assistant (lib/actions/assistant.ts) — every single tool
 * here is hard-coded to the ONE customerId passed in from the public
 * khata page's own URL, which is itself an unguessable UUID (same
 * trust model as the khata page already uses). There is no tool here
 * that can reach another customer's data, another shop, or anything
 * beyond "what did THIS customer buy and what do THEY owe" — genuinely
 * cannot be prompted into stepping outside that, since the tools
 * themselves don't accept a customer/shop argument at all. */
const TOOLS = [
  {
    type: "function",
    function: { name: "get_my_balance", description: "This customer's current outstanding udhar balance.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "get_my_purchase_history",
      description: "This customer's recent bills — what they bought, when, and how much.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "How many recent bills, default 10." } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_item_purchases",
      description: "How many times and when this customer bought a specific item.",
      parameters: { type: "object", properties: { itemName: { type: "string", description: "The item name, or part of it." } }, required: ["itemName"] },
    },
  },
];

async function runCustomerTool(name: string, args: Record<string, unknown>, customerId: string): Promise<unknown> {
  const admin = createSupabaseAdminClient();

  if (name === "get_my_balance") {
    const [{ data: bills }, { data: payments }] = await Promise.all([
      admin.from("bills").select("credit_amount").eq("customer_id", customerId).eq("status", "active"),
      admin.from("payments").select("amount").eq("customer_id", customerId),
    ]);
    const totalCredit = (bills ?? []).reduce((s, b) => s + Number(b.credit_amount), 0);
    const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    return { outstandingUdhar: Math.round(Math.max(0, totalCredit - totalPaid)) };
  }

  if (name === "get_my_purchase_history") {
    const limit = Number(args.limit) || 10;
    const { data } = await admin
      .from("bills")
      .select("invoice_number, total, paid_amount, credit_amount, created_at")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);
    return {
      bills: (data ?? []).map((b) => ({ invoiceNumber: b.invoice_number, total: Number(b.total), date: new Date(b.created_at).toDateString(), onUdhar: Number(b.credit_amount) })),
    };
  }

  if (name === "get_my_item_purchases") {
    const search = String(args.itemName ?? "").trim();
    if (!search) return { error: "No item name given" };
    const { data: bills } = await admin.from("bills").select("id, created_at").eq("customer_id", customerId).eq("status", "active");
    const billIds = (bills ?? []).map((b) => b.id);
    if (billIds.length === 0) return { count: 0, purchases: [] };
    const dateByBill = new Map((bills ?? []).map((b) => [b.id, b.created_at]));
    const { data: items } = await admin.from("bill_items").select("bill_id, product_name, quantity").in("bill_id", billIds).ilike("product_name", `%${search}%`);
    return {
      count: (items ?? []).length,
      purchases: (items ?? []).map((i) => ({ item: i.product_name, quantity: Number(i.quantity), date: new Date(dateByBill.get(i.bill_id) ?? "").toDateString() })),
    };
  }

  return { error: `Unknown tool: ${name}` };
}

export type CustomerChatMessage = { role: "user" | "assistant"; text: string };

/** The customer's own khata assistant — "poochho apna hisaab". No
 * login needed (same as the khata page itself), but every tool call
 * is hard-scoped to the customerId from the page's own URL, so this
 * genuinely can't be asked about anyone else's account. */
export async function askCustomerAssistantAction(
  customerId: string,
  question: string,
  history: CustomerChatMessage[],
): Promise<{ answer?: string; error?: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  // Confirm this customer genuinely exists before doing anything else
  // — a bad/tampered ID should fail closed, not silently query with
  // an empty result.
  const admin = createSupabaseAdminClient();
  const { data: customer } = await admin.from("customers").select("id, name").eq("id", customerId).maybeSingle();
  if (!customer) return { error: "Customer not found" };

  const messages = [
    {
      role: "system",
      content: `You are a helpful assistant answering ${customer.name} about THEIR OWN account with a shop, nothing else. Reply in the same language/mix they used (Hindi, English, Hinglish). Keep answers short and direct — numbers first. Money is in Indian Rupees (₹). If asked about anything outside their own purchases/balance, politely say you can only help with their own account here.`,
    },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content: question },
  ];

  try {
    for (let round = 0; round < 3; round++) {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: GROQ_MODEL, messages, tools: TOOLS, temperature: 0.2 }),
      });
      if (!response.ok) {
        console.error("Customer assistant request failed", response.status, await response.text().catch(() => ""));
        return { error: "Couldn't process that — please try again." };
      }
      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      const toolCalls: { id: string; function: { name: string; arguments: string } }[] = message?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        const text = String(message?.content ?? "").trim();
        return { answer: text || "Couldn't find an answer for that — try rephrasing?" };
      }

      messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: toolCalls } as never);
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // malformed arguments — treat as empty
        }
        const result = await runCustomerTool(call.function.name, args, customerId);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) } as never);
      }
    }
    return { error: "That took too many steps — try a simpler question." };
  } catch (err) {
    console.error("Customer assistant error", err);
    return { error: "Couldn't process that — please try again." };
  }
}
