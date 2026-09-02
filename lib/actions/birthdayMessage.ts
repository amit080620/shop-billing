"use server";

import { createSupabaseAdminClient } from "../supabase/admin";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Falls back to the same plain template the app always used if AI
 * isn't configured or the call fails — a birthday wish should never
 * be blocked by an AI hiccup. When it works, it's genuinely more
 * personal: mentioning what the customer actually buys most, not
 * just their name slotted into a fixed sentence. */
export async function generatePersonalizedBirthdayMessageAction(
  customerId: string,
  shopName: string,
  isToday: boolean,
): Promise<{ message: string }> {
  const admin = createSupabaseAdminClient();
  const { data: customerNameRow } = await admin.from("customers").select("name").eq("id", customerId).maybeSingle();
  const customerName = customerNameRow?.name ?? "there";

  const fallback = isToday
    ? `Happy birthday, ${customerName}! 🎉 Wishing you a wonderful year ahead — from all of us at ${shopName}.`
    : `Hi ${customerName}, wishing you an early happy birthday from ${shopName}! 🎉`;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { message: fallback };

  try {
    const { data: bills } = await admin.from("bills").select("id").eq("customer_id", customerId).eq("status", "active").limit(50);
    const billIds = (bills ?? []).map((b) => b.id);
    let topItem: string | null = null;
    if (billIds.length > 0) {
      const { data: items } = await admin.from("bill_items").select("product_name, quantity").in("bill_id", billIds);
      const totals = new Map<string, number>();
      for (const item of items ?? []) totals.set(item.product_name, (totals.get(item.product_name) ?? 0) + Number(item.quantity));
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      topItem = ranked[0]?.[0] ?? null;
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `Write a short, warm, COMPLETE WhatsApp birthday message (2-3 lines, use emojis naturally) from an Indian shop called "${shopName}" to their customer "${customerName}" — start the message by greeting them by name (e.g. "Happy birthday, ${customerName}!"). ${topItem ? `They often buy "${topItem}" — you can warmly reference that if it fits naturally, but don't force it.` : ""} ${isToday ? "Today IS their birthday." : "Their birthday is coming up soon — wish them a bit in advance, phrased as an early wish."} Return ONLY the message text, nothing else — no preamble, no quotes around it.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 150,
      }),
    });
    if (!response.ok) return { message: fallback };
    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return { message: text || fallback };
  } catch (err) {
    console.error("Birthday message generation failed", err);
    return { message: fallback };
  }
}
