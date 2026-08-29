"use server";

import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type OcrCorrection = { wrong: string; correct: string };

/** All corrections this shop has taught the scanner so far. Genuinely
 * cheap — a shop realistically accumulates dozens, not thousands, of
 * these over time, so fetching the whole list per scan is fine. */
export async function getOcrCorrectionsAction(): Promise<OcrCorrection[]> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("ocr_corrections").select("wrong_text, correct_text").eq("shop_id", session.shopId);
  return (data ?? []).map((r) => ({ wrong: r.wrong_text, correct: r.correct_text }));
}

/** Called when someone edits a scanned name/description before
 * saving — if what they typed differs from what the scan actually
 * read, that's a genuine correction worth remembering. Silently
 * skips trivial cases (empty, unchanged, or the "correction" is
 * itself blank) rather than polluting the table with noise. Best-
 * effort — a failed save here should never block the actual
 * product/purchase save that triggered it. */
export async function saveOcrCorrectionsAction(corrections: OcrCorrection[]): Promise<void> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const rows = corrections
    .filter((c) => c.wrong.trim() && c.correct.trim() && c.wrong.trim().toLowerCase() !== c.correct.trim().toLowerCase())
    .map((c) => ({ shop_id: session.shopId, wrong_text: c.wrong.trim(), correct_text: c.correct.trim() }));
  if (rows.length === 0) return;

  const { error } = await admin.from("ocr_corrections").upsert(rows, { onConflict: "shop_id,wrong_text" });
  if (error) console.error("Could not save OCR corrections", error);
}
