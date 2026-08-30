"use server";

import { requireSession } from "../auth";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type PosterText = { headline: string; offerLine: string; ctaLine: string };

/** Deliberately text-only — the actual visual poster is built by a
 * fixed SVG template (PosterCanvas.tsx), not by an image-generation
 * model. Free image-generation APIs are genuinely unreliable at
 * rendering legible text inside an image (prices, shop names, offer
 * details routinely come out garbled), which would be actively
 * worse than not having this feature. Using AI for what it's
 * reliably good at — short, punchy copy — and a deterministic
 * template for the visual layout gives a consistent, on-brand result
 * every single time, for free, with no risk of garbled output. */
export async function generatePosterTextAction(occasion: string, discountPercent: number | null): Promise<{ text?: PosterText; error?: string }> {
  await requireSession();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured" };

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `Write short, punchy poster copy for an Indian shop's festival/sale offer. Return ONLY a JSON object with exactly these fields: {"headline": "3-5 words, ALL CAPS, exciting", "offerLine": "one short line stating the offer, e.g. 'FLAT 20% OFF' or 'Best Prices in Town'", "ctaLine": "one short urgency/call-to-action line, e.g. 'Limited time only!' or 'Visit us today!'"}. Keep everything genuinely short — this goes on a poster, not a paragraph. Match the language to what's natural for the occasion given (Hindi/English/Hinglish, whatever fits an Indian shop's festival poster).`,
          },
          {
            role: "user",
            content: `Occasion: ${occasion || "general sale"}.${discountPercent ? ` Discount: ${discountPercent}%.` : ""}`,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("Poster text request failed", response.status, await response.text().catch(() => ""));
      return { error: "Couldn't write that — please try again." };
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<PosterText>;
    if (!parsed.headline || !parsed.offerLine) return { error: "Couldn't write that — please try again." };

    return {
      text: {
        headline: String(parsed.headline).slice(0, 40),
        offerLine: String(parsed.offerLine).slice(0, 50),
        ctaLine: String(parsed.ctaLine ?? "Limited time only!").slice(0, 40),
      },
    };
  } catch (err) {
    console.error("Poster text error", err);
    return { error: "Couldn't write that — please try again." };
  }
}
