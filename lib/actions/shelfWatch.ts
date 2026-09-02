"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

const MODEL = "gemini-3.5-flash-lite";

export type ShelfWatch = { id: string; name: string; photoUrl: string | null; lastCheckedAt: string };
export type ShelfChange = { item: string; observation: string };

export async function getShelfWatchesAction(): Promise<ShelfWatch[]> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("shelf_watches").select("*").eq("shop_id", session.shopId).order("last_checked_at", { ascending: false });
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, photoUrl: s.photo_url, lastCheckedAt: s.last_checked_at }));
}

export async function createShelfWatchAction(name: string): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Naam zaroori hai" };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("shelf_watches").insert({ shop_id: session.shopId, name: name.trim() }).select("id").single();
  if (error || !data) return { error: "Bana nahi paye" };
  return { id: data.id };
}

/** The actual comparison — sends the PREVIOUS photo (if one exists)
 * and the NEW photo together in one request, and asks Gemini to spot
 * items that look genuinely, noticeably lower now than before.
 * Deliberately asks for a qualitative read ("looks low/emptier"), not
 * a precise unit count — vision models aren't reliable enough at
 * exact counting through packaging/stacking/angle differences for
 * that to be an honest claim, but a clear "this looks a lot emptier
 * than last time" is genuinely something they're good at. */
export async function checkShelfPhotoAction(shelfId: string, newPhotoBase64: string, mimeType: string): Promise<{ changes?: ShelfChange[]; error?: string; errorType?: string }> {
  const session = await requireSession();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { error: "not_configured", errorType: "not_configured" };

  const admin = createSupabaseAdminClient();
  const { data: shelf } = await admin.from("shelf_watches").select("id, photo_url").eq("id", shelfId).eq("shop_id", session.shopId).maybeSingle();
  if (!shelf) return { error: "Shelf nahi mila" };

  const buffer = Buffer.from(newPhotoBase64, "base64");
  const path = `${session.shopId}/${shelfId}-${Date.now()}.jpg`;
  await admin.storage.from("shelf-photos").upload(path, buffer, { contentType: mimeType, upsert: true });
  const { data: publicUrlData } = admin.storage.from("shelf-photos").getPublicUrl(path);
  const newPhotoUrl = publicUrlData.publicUrl;

  let changes: ShelfChange[] = [];
  if (shelf.photo_url) {
    try {
      const prevResponse = await fetch(shelf.photo_url);
      const prevBuffer = Buffer.from(await prevResponse.arrayBuffer());
      const prevBase64 = prevBuffer.toString("base64");

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `These are two photos of the SAME shop shelf, taken at different times — the FIRST image is older, the SECOND is more recent. Compare them and identify any specific items that look NOTICEABLY lower in quantity / emptier in the second photo than the first — genuinely a clear difference, not a minor one. For each, describe what changed in a few words. Return ONLY a JSON array, no other text, like: [{"item": "Rice packets", "observation": "Noticeably fewer than before, shelf looks half-empty"}]. If nothing looks meaningfully different, return an empty array [].`,
                },
                { inlineData: { mimeType: "image/jpeg", data: prevBase64 } },
                { inlineData: { mimeType, data: newPhotoBase64 } },
              ],
            },
          ],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) changes = parsed.filter((c) => c && typeof c.item === "string" && typeof c.observation === "string");
      } else if (response.status === 429) {
        return { error: "AI quota khatam ho gaya aaj ke liye", errorType: "quota_exceeded" };
      }
    } catch (err) {
      console.error("Shelf comparison failed", err);
    }
  }

  await admin.from("shelf_watches").update({ photo_url: newPhotoUrl, last_checked_at: new Date().toISOString() }).eq("id", shelfId);

  return { changes };
}
