import { TRAINING_VIDEOS } from "./trainingVideos";

/** The 11-character video id from any YouTube link (watch, youtu.be, shorts, embed, live) or a bare id. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/) ?? s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** The playlist id from a YouTube playlist link. */
export function playlistId(input: string): string | null {
  return input.match(/[?&]list=([A-Za-z0-9_-]{10,})/)?.[1] ?? null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which chapter a YouTube title is: the number it starts with ("01 - …", "Chapter 7 …"), else the
 * chapter whose title it matches best. Null when nothing fits. */
export function chapterFromTitle(title: string): string | null {
  const n = title.match(/^\D{0,12}?(\d{1,2})(?!\d)/)?.[1];
  if (n) {
    const id = n.padStart(2, "0");
    if (TRAINING_VIDEOS.some((v) => v.id === id)) return id;
  }
  const words = new Set(
    norm(title)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  if (!words.size) return null;
  let best: { id: string; score: number } | null = null;
  for (const v of TRAINING_VIDEOS) {
    const own = norm(v.title)
      .split(" ")
      .filter((w) => w.length > 2);
    const score = own.filter((w) => words.has(w)).length / Math.max(own.length, 1);
    if (score > (best?.score ?? 0)) best = { id: v.id, score };
  }
  return best && best.score >= 0.6 ? best.id : null;
}

/** Video ids and titles from a playlist page's HTML (its ytInitialData). YouTube has used two
 * shapes for a playlist row — the older playlistVideoRenderer and the newer lockupViewModel — so
 * the page is cut at either marker and each piece read on its own. */
export function videosFromPlaylistHtml(html: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  const unescape = (s: string) => {
    try {
      return JSON.parse(`"${s}"`) as string;
    } catch {
      return s;
    }
  };
  for (const piece of html.split(/"(?:playlistVideoRenderer|lockupViewModel)":\{/).slice(1)) {
    const id = piece.match(/"(?:videoId|contentId)":"([A-Za-z0-9_-]{11})"/)?.[1];
    const title = piece.match(/"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/)?.[1] ?? piece.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!id || title === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: unescape(title) });
  }
  return out;
}

/** The embed address: subtitles on if the video has them, no other channels' videos at the end. */
export function youtubeEmbed(id: string, start = 0, autoplay = false) {
  const q = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    cc_load_policy: "1",
    cc_lang_pref: "hi",
    enablejsapi: "1",
    modestbranding: "1",
  });
  if (start > 0) q.set("start", String(Math.floor(start)));
  if (autoplay) q.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}
