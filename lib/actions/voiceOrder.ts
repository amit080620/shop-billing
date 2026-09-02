"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { findClosestMatch } from "../fuzzyMatch";

// Groq deprecated llama-3.3-70b-versatile on June 17, 2026 — this is
// their own recommended replacement, same free tier.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type VoiceOrderItem = {
  spokenName: string;
  quantity: number;
  matchedProductId: string | null;
  matchedProductName: string | null;
  price: number | null;
};

export type VoiceOrderErrorType = "not_configured" | "quota_exceeded" | "invalid_key" | "network_error";

function classifyStatus(httpStatus: number): VoiceOrderErrorType {
  if (httpStatus === 429) return "quota_exceeded";
  if (httpStatus === 401 || httpStatus === 403) return "invalid_key";
  return "network_error";
}

/** Turns a spoken transcript ("2 samosa, 1 chai", or the Hindi-number
 * equivalent "do samosa, ek chai") into structured items matched
 * against this shop's real product catalog. Uses Groq (open-source
 * Llama, same as the assistant) purely for the language
 * understanding — extracting names/quantities from natural,
 * code-mixed speech — then falls back to the same deterministic
 * fuzzy-match already used elsewhere in the app (findClosestMatch) to
 * find the actual product, so a name Groq gets slightly wrong
 * ("samoja" instead of "samosa") still resolves correctly as long as
 * it's close enough. */
export async function parseVoiceOrderAction(transcript: string): Promise<{
  items?: VoiceOrderItem[];
  customer?: { spokenName: string; matchedId: string | null; matchedName: string | null };
  error?: string;
  errorType?: VoiceOrderErrorType;
}> {
  const session = await requireSession();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured", errorType: "not_configured" };
  if (!transcript.trim()) return { items: [] };

  const admin = createSupabaseAdminClient();
  const [{ data: products }, { data: customers }] = await Promise.all([
    admin.from("products").select("id, name, price").eq("shop_id", session.shopId),
    admin.from("customers").select("id, name").eq("shop_id", session.shopId),
  ]);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `Extract items, quantities, and (if mentioned) the CUSTOMER'S NAME from spoken text for a shop bill. The person may speak Hindi, English, or a mix, and may use Hindi number words (ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10). Quantity may come BEFORE or AFTER the item name ("do samosa" and "samosa do" both mean 2 samosa). If no quantity is said for an item, default to 1. If they say something like "Amit ke liye bill banao" or "bill for Amit" or "Amit ka bill", the customer name is "Amit" — put it in customerName. A customer name is a PERSON's name, never an item. If no customer is mentioned, omit customerName entirely. Return ONLY a JSON object like: {"customerName": "Amit", "items": [{"name": "samosa", "quantity": 2}]}.`,
          },
          { role: "user", content: transcript },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("Voice order request failed", response.status, await response.text().catch(() => ""));
      return { error: "Couldn't understand that — please try again.", errorType: classifyStatus(response.status) };
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content ?? "[]";
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { error: "Couldn't understand that — please try again." };
    }
    // Groq's JSON mode wraps the array in an object sometimes
    // ({"items": [...]}) depending on how it interprets the schema —
    // handle both shapes rather than assuming one.
    const list: { name?: string; quantity?: number }[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.items)
        ? ((parsed as Record<string, unknown>).items as { name?: string; quantity?: number }[])
        : [];

    const items: VoiceOrderItem[] = list
      .filter((p) => p.name && p.name.trim())
      .map((p) => {
        const spokenName = String(p.name).trim();
        // Looser threshold than the OCR fuzzy-match — speech-to-text
        // transcription is noisier than a scanned photo, so a slightly
        // wider net here still avoids false-matching two genuinely
        // different products.
        const match = findClosestMatch(spokenName, products ?? [], 0.55);
        const product = match ? (products ?? []).find((pr) => pr.id === match.id) : null;
        return {
          spokenName,
          quantity: Math.max(1, Math.round(Number(p.quantity)) || 1),
          matchedProductId: product?.id ?? null,
          matchedProductName: product?.name ?? null,
          price: product ? Number(product.price) : null,
        };
      });

    // The spoken customer name gets the same fuzzy treatment as
    // product names — speech-to-text mangles names constantly
    // ("Amit" heard as "Ameet"), and a name that doesn't match any
    // existing customer is still worth returning so the caller can
    // offer to create them rather than silently dropping it.
    const spokenCustomerName = typeof (parsed as Record<string, unknown>)?.customerName === "string" ? String((parsed as Record<string, unknown>).customerName).trim() : "";
    let customer: { spokenName: string; matchedId: string | null; matchedName: string | null } | undefined;
    if (spokenCustomerName) {
      const match = findClosestMatch(spokenCustomerName, customers ?? [], 0.7);
      customer = { spokenName: spokenCustomerName, matchedId: match?.id ?? null, matchedName: match?.name ?? null };
    }

    return { items, customer };
  } catch (err) {
    console.error("Voice order parse error", err);
    return { error: "Couldn't understand that — please try again." };
  }
}
