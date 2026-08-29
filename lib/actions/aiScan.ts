"use server";

/** Genuinely reads a photo and understands it — not just raw text
 * extraction like the free Tesseract pipeline, but actual
 * "this is a name, this is a price" comprehension, which is why it's
 * meaningfully more accurate on messy handwriting, angled photos, and
 * multi-column layouts. Used for the two scan flows in the app:
 * "products" (price lists/menus/rate cards → name + price) and
 * "purchase" (vendor bills → name + quantity + rate).
 *
 * Requires GEMINI_API_KEY to be set (Vercel/​.env.local) — when it
 * isn't, or the call fails for any reason, this returns an `error`
 * and the caller falls back to the free on-device Tesseract pipeline
 * that already existed, so nothing breaks for anyone who hasn't set
 * up a key. */

export type AIScanItem = { name: string; price?: number; quantity?: number; category?: string | null };

const MODEL = "gemini-2.5-flash-lite";

const PROMPTS = {
  products: `You are reading a photo of a shop's price list — this could be a restaurant menu, a vendor's rate card, a handwritten register page, or a printed catalog sheet. Extract every item that has both a name and a price. Return ONLY a JSON array, no other text, like: [{"name": "Item Name", "price": 120, "category": "optional section/category name or null"}]. Strip any currency symbols or "Rs"/"₹" from the price — return just the plain number. Ignore headers, page totals, and any line without both a clear name and a numeric price.`,
  purchase: `You are reading a photo of a vendor's purchase bill or invoice. Extract every line item with its description, quantity, and its PER-UNIT rate (not the line total for that row). Return ONLY a JSON array, no other text, like: [{"name": "Item description", "quantity": 5, "price": 45.50}]. Ignore the bill's own header, GSTIN/tax-registration lines, the grand total row, tax breakdown rows (CGST/SGST/IGST), and any signature/footer text.`,
};

export async function scanImageWithAI(
  imageBase64: string,
  mode: "products" | "purchase",
): Promise<{ items?: AIScanItem[]; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "AI scan is not set up for this shop yet" };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPTS[mode] }, { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });

    if (!response.ok) {
      console.error("Gemini scan request failed", response.status, await response.text().catch(() => ""));
      return { error: "AI scan couldn't process this photo" };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return { error: "AI scan returned no data" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: "AI scan returned an unreadable response" };
    }
    if (!Array.isArray(parsed)) return { error: "AI scan returned an unexpected format" };

    const items: AIScanItem[] = parsed
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object" && typeof (it as Record<string, unknown>).name === "string")
      .map((it) => {
        const priceNum = typeof it.price === "number" ? it.price : Number(it.price);
        const qtyNum = typeof it.quantity === "number" ? it.quantity : it.quantity ? Number(it.quantity) : undefined;
        return {
          name: String(it.name).trim().slice(0, 120),
          price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
          quantity: qtyNum !== undefined && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : undefined,
          category: it.category ? String(it.category).trim() : null,
        };
      })
      .filter((it) => it.name.length >= 2);

    if (items.length === 0) return { error: "AI scan couldn't find any items in this photo" };
    return { items };
  } catch (err) {
    console.error("Gemini scan error", err);
    return { error: "AI scan couldn't process this photo" };
  }
}
