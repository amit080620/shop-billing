"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string; saved?: boolean } | null;

export async function saveFestivalNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const slug = formData.get("slug");
  const note = formData.get("note");
  if (typeof slug !== "string" || !slug.trim()) {
    return { error: "Missing festival" };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("festival_notes").upsert({
    shop_id: session.shopId,
    festival_slug: slug,
    note: typeof note === "string" ? note.trim() : "",
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Could not save festival note", error);
    return { error: "Could not save note" };
  }

  revalidatePath("/festivals");
  return { saved: true };
}
