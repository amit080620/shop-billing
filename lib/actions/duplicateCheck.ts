"use server";

import { findClosestMatch, similarity } from "../fuzzyMatch";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type DuplicateMatch = { id: string; name: string; viaAI: boolean };

/** The actual hybrid: code alone handles the clear cases (both a
 * confident match AND a confident non-match) instantly and for free —
 * AI is only ever called for names sitting in the genuinely uncertain
 * middle (0.5–0.75 similarity), where code's letter/word comparison
 * can't tell whether "iPhone 13" and "Apple iPhone 13" are the same
 * product or "RDN 12" and "Redmi Note 12" are an abbreviation of each
 * other — that needs actual meaning, not string distance. Most real
 * purchases/products never touch the AI path at all; it's a safety
 * net for the cases code genuinely can't judge, not the primary
 * mechanism. */
export async function findDuplicateProductAI(
  query: string,
  candidates: { id: string; name: string }[],
): Promise<DuplicateMatch | null> {
  // Fast path — confident match or confident non-match, no AI needed.
  const confident = findClosestMatch(query, candidates, 0.75);
  if (confident) return { id: confident.id, name: confident.name, viaAI: false };

  // The uncertain middle — genuinely worth a second, smarter opinion.
  const borderline = candidates
    .map((c) => ({ ...c, score: similarity(query, c.name) }))
    .filter((c) => c.score >= 0.5 && c.score < 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // cap how many candidates go to the AI — keeps this cheap and fast even with a large catalog

  if (borderline.length === 0) return null;

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null; // no key configured — fail closed to "not a duplicate" rather than block product creation

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You check whether a newly-typed product name refers to the SAME physical product as one already in a shop's catalog — genuinely the same item, not just a similar category (e.g. "iPhone 13" and "Apple iPhone 13" ARE the same; "iPhone 13" and "iPhone 13 Case" are NOT). Consider abbreviations, word order, extra/missing brand words, and Hindi/English naming of the same item. Return ONLY a JSON object: {"matchIndex": <the 0-based index of the matching candidate, or -1 if none genuinely match>}.`,
          },
          {
            role: "user",
            content: `New item: "${query}"\nExisting candidates:\n${borderline.map((c, i) => `${i}. ${c.name}`).join("\n")}`,
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) return null; // AI unavailable — fail closed, same as no key configured
    const data = await response.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as { matchIndex?: number };
    const idx = typeof parsed.matchIndex === "number" ? parsed.matchIndex : -1;
    if (idx < 0 || idx >= borderline.length) return null;
    return { id: borderline[idx].id, name: borderline[idx].name, viaAI: true };
  } catch (err) {
    console.error("Duplicate-check AI call failed", err);
    return null; // never let an AI hiccup block someone from adding a product
  }
}
