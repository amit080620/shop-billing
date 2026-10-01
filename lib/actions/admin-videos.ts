"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdmin } from "../admin-auth";
import { TRAINING_VIDEOS } from "../trainingVideos";
import { youtubeId } from "../youtube";
import { readYoutubeLinks, saveYoutubeIds, YOUTUBE_TAG, type YoutubeFound } from "../youtubeData";

/** Reads a pasted playlist / video links and says which chapter each video is. Saves nothing. */
export async function readYoutubeLinksAction(text: string): Promise<{ ok: true; found: YoutubeFound[]; playlistError?: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if (!text.trim()) return { ok: false, error: "Paste a playlist link or video links first." };
  const res = await readYoutubeLinks(text.slice(0, 20000));
  if (!res.found.length)
    return {
      ok: false,
      error: res.playlistError ?? "No YouTube links found in that text.",
    };
  return { ok: true, ...res };
}

/** Saves which YouTube video plays each chapter. A blank chapter goes back to the storage copy. */
export async function saveYoutubeLinksAction(links: Record<string, string>): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const ids: Record<string, string> = {};
  for (const v of TRAINING_VIDEOS) {
    const raw = (links[v.id] ?? "").trim();
    if (!raw) continue;
    const id = youtubeId(raw);
    if (!id)
      return {
        ok: false,
        error: `Chapter ${v.id}: "${raw.slice(0, 60)}" is not a YouTube link.`,
      };
    ids[v.id] = id;
  }
  try {
    await saveYoutubeIds(ids);
  } catch (e) {
    return { ok: false, error: `Could not save: ${(e as Error).message}` };
  }
  revalidateTag(YOUTUBE_TAG);
  revalidatePath("/admin/videos");
  return { ok: true, count: Object.keys(ids).length };
}
