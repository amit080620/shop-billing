import "server-only";
import { SITE_URL } from "./site";
import type { TrainingVideo } from "../trainingVideos";
import { loadYoutubeDates } from "../youtubeData";

export type TranscriptPart = { title: string; start: number; text: string };

const toSeconds = (t: string) => {
  const [h, m, s] = t.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

/** What is said in a training video, from its subtitles, grouped under the video's own chapter
 * titles — readable text for people who prefer it and for search engines. Fetched from the site's
 * own subtitle file and kept a day. */
export async function loadTranscript(video: TrainingVideo): Promise<TranscriptPart[]> {
  let vtt = "";
  try {
    const res = await fetch(`${SITE_URL}/training-videos/${video.id}.vtt`, { next: { revalidate: 86400 } });
    if (res.ok) vtt = await res.text();
  } catch {
    return [];
  }
  const cues: { start: number; text: string }[] = [];
  for (const block of vtt.replace(/\r\n/g, "\n").split(/\n\n+/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const text = lines.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) cues.push({ start: toSeconds(lines[at].split("-->")[0].trim()), text });
  }
  if (!cues.length) return [];
  const starts: [number, string][] = video.topics.length ? [[0, "Introduction"], ...video.topics.filter(([s]) => s > 0)] : [[0, video.title]];
  const parts: TranscriptPart[] = starts.map(([start, title]) => ({ title, start, text: "" }));
  for (const cue of cues) {
    let i = 0;
    while (i + 1 < parts.length && parts[i + 1].start <= cue.start + 0.5) i++;
    parts[i].text += (parts[i].text ? " " : "") + cue.text;
  }
  return parts.filter((p) => p.text);
}

/** The day the video went on YouTube (saved with its link, see loadYoutubeDates); for a video still
 * playing from storage, the day the training videos were published. */
export async function youtubeUploadDate(youtubeId: string | null): Promise<string> {
  const fallback = "2026-10-02T00:00:00+05:30";
  if (!youtubeId) return fallback;
  return (await loadYoutubeDates())[youtubeId] ?? fallback;
}

const isoDuration = (seconds: number) => `PT${Math.floor(seconds / 60)}M${Math.round(seconds % 60)}S`;

/** schema.org VideoObject, with each chapter as a Clip so search can link straight to a part. */
export function videoObject(video: TrainingVideo, opts: { youtubeId: string | null; uploadDate: string; mp4: string; description: string }) {
  const url = `${SITE_URL}/videos/${video.id}`;
  const starts = video.topics.map(([s]) => s);
  return {
    "@type": "VideoObject",
    "@id": `${url}#video`,
    name: video.title,
    description: opts.description,
    thumbnailUrl: [`${SITE_URL}/training-videos/${video.id}.jpg`, ...(opts.youtubeId ? [`https://i.ytimg.com/vi/${opts.youtubeId}/hqdefault.jpg`] : [])],
    uploadDate: opts.uploadDate,
    duration: isoDuration(video.seconds),
    inLanguage: "hi-IN",
    ...(opts.youtubeId ? { embedUrl: `https://www.youtube.com/embed/${opts.youtubeId}` } : { contentUrl: opts.mp4 }),
    publisher: { "@id": `${SITE_URL}/#organization` },
    hasPart: video.topics.map(([start, name], i) => ({
      "@type": "Clip",
      name,
      startOffset: start,
      endOffset: starts[i + 1] ?? video.seconds,
      url: `${url}?t=${start}`,
    })),
  };
}
