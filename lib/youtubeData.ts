import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";
import { TRAINING_VIDEOS } from "./trainingVideos";
import { chapterFromTitle, playlistId, videosFromPlaylistHtml, youtubeId } from "./youtube";

/** Which YouTube video plays each training chapter: { "01": "dQw4w9WgXcQ", … }. Kept as a small
 * JSON file next to the videos in storage, so the team can switch a chapter to YouTube from the
 * admin panel without a database change or a deploy. A chapter without an id plays from storage. */
export const YOUTUBE_FILE = "youtube.json";
export const YOUTUBE_TAG = "youtube-ids";

async function readYoutubeFile(): Promise<Record<string, unknown>> {
  const { data, error } = await createSupabaseAdminClient().storage.from("training-videos").download(YOUTUBE_FILE);
  if (error || !data) return {};
  return JSON.parse(await data.text()) as Record<string, unknown>;
}

const loadYoutubeFile = unstable_cache(
  async (): Promise<Record<string, unknown>> => {
    try {
      return await readYoutubeFile();
    } catch {
      return {};
    }
  },
  [YOUTUBE_TAG],
  { revalidate: 600, tags: [YOUTUBE_TAG] },
);

export async function loadYoutubeIds(): Promise<Record<string, string>> {
  const raw = await loadYoutubeFile();
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => TRAINING_VIDEOS.some((v) => v.id === e[0]) && typeof e[1] === "string" && youtubeId(e[1]) === e[1]));
}

/** When each linked video went on YouTube, by YouTube id ({ "7uL9SqaxYWw": "2026-10-02T06:35:17-07:00" }),
 * for search engines (VideoObject uploadDate). Kept in the same file under "_dates", written from a
 * computer (YouTube turns away cloud servers asking for its pages). */
export async function loadYoutubeDates(): Promise<Record<string, string>> {
  const dates = (await loadYoutubeFile())._dates;
  if (!dates || typeof dates !== "object") return {};
  return Object.fromEntries(Object.entries(dates as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && !Number.isNaN(Date.parse(e[1]))));
}

export async function saveYoutubeIds(ids: Record<string, string>) {
  // Keep the upload dates already saved with the links.
  let dates: unknown;
  try {
    dates = (await readYoutubeFile())._dates;
  } catch {
    dates = undefined;
  }
  const body = new Blob([JSON.stringify(dates ? { ...ids, _dates: dates } : ids, null, 1)], {
    type: "application/json",
  });
  const { error } = await createSupabaseAdminClient().storage.from("training-videos").upload(YOUTUBE_FILE, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "60",
  });
  if (error) throw new Error(error.message);
}

const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function titleOf(id: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
      headers: UA,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return ((await r.json()) as { title?: string }).title ?? null;
  } catch {
    return null;
  }
}

export type YoutubeFound = {
  ytId: string;
  title: string;
  chapter: string | null;
};

/** Everything that can be read from pasted text: a playlist link (all its videos) and/or video
 * links. Each video's title says which chapter it is ("01 - …"). */
export async function readYoutubeLinks(text: string): Promise<{ found: YoutubeFound[]; playlistError?: string }> {
  const found: YoutubeFound[] = [];
  const seen = new Set<string>();
  let playlistError: string | undefined;

  const list = playlistId(text);
  if (list) {
    try {
      const r = await fetch(`https://www.youtube.com/playlist?list=${list}`, {
        headers: UA,
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      const rows = r.ok ? videosFromPlaylistHtml(await r.text()) : [];
      if (!rows.length) playlistError = "Could not read that playlist. Check it is Public or Unlisted (not Private), or paste the video links instead.";
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        found.push({
          ytId: row.id,
          title: row.title,
          chapter: chapterFromTitle(row.title),
        });
      }
    } catch {
      playlistError = "YouTube did not answer. Try again, or paste the video links instead.";
    }
  }

  const links = [...text.matchAll(/\S+/g)].map((m) => m[0]).filter((w) => !w.includes("/playlist?"));
  for (const w of links) {
    const id = youtubeId(w);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = (await titleOf(id)) ?? "";
    found.push({
      ytId: id,
      title,
      chapter: title ? chapterFromTitle(title) : null,
    });
  }
  return { found, playlistError };
}
