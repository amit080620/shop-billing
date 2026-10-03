import Link from "@/lib/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { loadYoutubeIds } from "@/lib/youtubeData";
import { TRAINING_VIDEOS, mmss } from "@/lib/trainingVideos";
import { YoutubeLinksForm } from "./YoutubeLinksForm";

/** Which training chapters play from YouTube. Paste the playlist link once; every chapter whose
 * YouTube title starts with its number ("01 - …") is matched. Blank = plays from storage. */
export default async function AdminVideosPage() {
  await requireSuperAdmin();
  const ids = await loadYoutubeIds();
  const chapters = TRAINING_VIDEOS.map((v) => ({
    id: v.id,
    title: v.title,
    length: mmss(v.seconds),
    link: ids[v.id] ? `https://youtu.be/${ids[v.id]}` : "",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Training videos</h1>
        <Link href="/videos" target="_blank" className="text-xs text-gray-400">
          Open /videos →
        </Link>
      </div>
      <p className="text-xs text-gray-400">
        {Object.keys(ids).length} of {TRAINING_VIDEOS.length} chapters play from YouTube; the rest play from storage. Upload the chapter files to YouTube with their names as titles (&quot;01 -
        …&quot;), put them in one playlist, paste the playlist link below, then Save.
      </p>
      <YoutubeLinksForm chapters={chapters} />
    </div>
  );
}
