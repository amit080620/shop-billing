"use server";

import { requireSession } from "../auth";
import { loadYoutubeIds } from "../youtubeData";
import { videoById, videoFiles } from "../trainingVideos";

/** A training video's details for the ▶ popup in the top bar (app/components/ScreenVideoLink): what
 * its page (/help/videos/[id]) shows, fetched only when ▶ is tapped. */
export async function screenVideoAction(id: string) {
  await requireSession();
  const video = videoById(id);
  if (!video) return null;
  const files = videoFiles(video.id);
  const youtubeId = (await loadYoutubeIds())[video.id] ?? null;
  return { id: video.id, title: video.title, seconds: video.seconds, topics: video.topics, mp4: files.mp4, poster: files.poster, vtt: files.vtt, youtubeId };
}
