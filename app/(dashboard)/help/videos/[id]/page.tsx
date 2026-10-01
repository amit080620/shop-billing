import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { VideoPlayer } from "@/app/components/VideoPlayer";
import { loadYoutubeIds } from "@/lib/youtubeData";
import { mmss, videoById, videoFiles, videosFor } from "@/lib/trainingVideos";

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t: at } = await searchParams;
  const { t } = await getTranslator();
  const session = await requireSession();
  const video = videoById(id);
  if (!video) notFound();
  const files = videoFiles(video.id);
  const youtubeId = (await loadYoutubeIds())[video.id] ?? null;
  const start = Math.max(0, Math.min(video.seconds - 5, Number(at) || 0));
  const { own, common } = videosFor(session.businessType);
  const next = [...own, ...common].filter((v) => v.id !== video.id).slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/help/videos" />
      <PageHeader title={video.title} subtitle={youtubeId ? mmss(video.seconds) : t("{length} · subtitles on", { length: mmss(video.seconds) })} icon={<PlayCircle size={18} strokeWidth={1.8} />} />
      <VideoPlayer
        src={files.mp4}
        poster={files.poster}
        vtt={files.vtt}
        youtubeId={youtubeId}
        start={start}
        topics={video.topics}
        shareText={`The Ray — ${video.title}`}
        shareUrl={`https://bill.theray.in/videos/${video.id}`}
        words={{ topics: t("Jump to a part"), share: t("Share this video on WhatsApp"), subtitlesNote: t("Subtitles are on — turn them off from the player's CC button."), youtubeNote: t("Clearer picture: tap ⚙ in the player and pick a higher quality.") }}
      />
      <section className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-foreground">{t("More videos")}</p>
        {next.map((v) => (
          <Link key={v.id} href={`/help/videos/${v.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-foreground">{v.title}</span>
            <span className="shrink-0 text-xs text-muted">{mmss(v.seconds)}</span>
          </Link>
        ))}
        <Link href="/help/videos" className="self-start text-xs font-medium text-brand-text">
          {t("All videos →")}
        </Link>
      </section>
    </div>
  );
}
