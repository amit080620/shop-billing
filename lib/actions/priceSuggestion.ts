"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type PriceSuggestion = { price: number | null; gstPercent: number | null; reasoning: string };

/** Grounded ONLY in this shop's own existing products — never
 * guesses a price from general knowledge (which would be genuinely
 * unreliable and could mislead a shop owner into under/over-pricing).
 * If nothing in the catalog is similar enough to compare against, it
 * says so honestly rather than inventing a number. */
export async function suggestProductPriceAction(productName: string): Promise<{ suggestion?: PriceSuggestion; error?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };
  if (!productName.trim()) return { error: "No product name given" };

  const admin = createSupabaseAdminClient();
  const { data: existingProducts } = await admin.from("products").select("name, price, gst_percent").eq("shop_id", session.shopId).limit(150);
  if (!existingProducts || existingProducts.length === 0) {
    return { suggestion: { price: null, gstPercent: null, reasoning: "Catalog is empty — no similar products to compare against yet." } };
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You suggest a starting price and GST% for a NEW product being added to an Indian shop's catalog, based ONLY on genuinely similar products already in their own catalog (never your general knowledge of prices). If nothing in the list is genuinely comparable, say so honestly with price/gstPercent as null rather than guessing. Return ONLY a JSON object: {"price": <number or null>, "gstPercent": <number or null>, "reasoning": "<one short sentence explaining what you compared it to, or why you couldn't>"}.`,
          },
          {
            role: "user",
            content: `New product: "${productName}"\n\nExisting catalog (name, price, GST%):\n${existingProducts.map((p) => `${p.name} — ₹${p.price}, ${p.gst_percent}%`).join("\n")}`,
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) return { error: "Couldn't suggest a price — please try again." };
    const data = await response.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as Partial<PriceSuggestion>;
    return {
      suggestion: {
        price: typeof parsed.price === "number" ? parsed.price : null,
        gstPercent: typeof parsed.gstPercent === "number" ? parsed.gstPercent : null,
        reasoning: parsed.reasoning ?? "",
      },
    };
  } catch (err) {
    console.error("Price suggestion failed", err);
    return { error: "Couldn't suggest a price — please try again." };
  }
}
