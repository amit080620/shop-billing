import type { Metadata } from "next";
import Link from "@/lib/link";
import { notFound } from "next/navigation";
import { getTranslator } from "@/lib/i18n/server";
import { VideoPlayer } from "@/app/components/VideoPlayer";
import { loadYoutubeIds } from "@/lib/youtubeData";
import { mmss, videoById, videoFiles, videosFor } from "@/lib/trainingVideos";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumbs, graph, organization } from "@/lib/seo/site";
import { loadTranscript, videoObject, youtubeUploadDate } from "@/lib/seo/videoSeo";

const describe = (video: NonNullable<ReturnType<typeof videoById>>) =>
  `Training video, ${mmss(video.seconds)}: ${video.topics
    .slice(0, 6)
    .map(([, title]) => title)
    .join(", ")}.`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const video = videoById(id);
  if (!video) return { title: "Video not found" };
  return {
    title: `${video.title} | The Ray`,
    description: describe(video),
    alternates: { canonical: `/videos/${video.id}` },
    openGraph: { images: [videoFiles(video.id).poster] },
  };
}

/** One training video without a login, with the demo and sign-up one tap away. */
export default async function PublicVideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; type?: string }> }) {
  const { id } = await params;
  const { t: at, type } = await searchParams;
  const { t } = await getTranslator();
  const video = videoById(id);
  if (!video) notFound();
  const files = videoFiles(video.id);
  const youtubeId = (await loadYoutubeIds())[video.id] ?? null;
  const [transcript, uploadDate] = await Promise.all([loadTranscript(video), youtubeUploadDate(youtubeId)]);
  const start = Math.max(0, Math.min(video.seconds - 5, Number(at) || 0));
  const { own, common } = videosFor(type ?? "");
  const next = [...own, ...common].filter((v) => v.id !== video.id).slice(0, 4);
  const back = `/videos${type ? `?type=${encodeURIComponent(type)}` : ""}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
        <Link href={back} className="text-sm font-medium text-brand-text">
          ← {t("All videos")}
        </Link>
        <Link href="/signup" className="btn-primary-sm">
          {t("login.setOneUp")}
        </Link>
      </header>
      <JsonLd
        data={graph(
          organization,
          videoObject(video, { youtubeId, uploadDate, mp4: files.mp4, description: describe(video) }),
          breadcrumbs([
            { name: "The Ray", path: "/" },
            { name: "Training videos", path: "/videos" },
            { name: video.title, path: `/videos/${video.id}` },
          ]),
        )}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16">
        <div>
          <h1 className="text-lg font-bold text-foreground">{video.title}</h1>
          <p className="text-xs text-muted">{youtubeId ? mmss(video.seconds) : t("{length} · subtitles on", { length: mmss(video.seconds) })}</p>
        </div>
        <VideoPlayer
          src={files.mp4}
          poster={files.poster}
          vtt={files.vtt}
          youtubeId={youtubeId}
          start={start}
          topics={video.topics}
          shareText={`The Ray — ${video.title}`}
          shareUrl={`https://bill.theray.in/videos/${video.id}`}
          words={{
            topics: t("Jump to a part"),
            share: t("Share this video on WhatsApp"),
            subtitlesNote: t("Subtitles are on — turn them off from the player's CC button."),
            youtubeNote: t("Clearer picture: tap ⚙ in the player and pick a higher quality."),
          }}
        />
        <div className="neu-card flex flex-col items-center gap-2 p-4 text-center">
          <p className="text-sm font-semibold text-foreground">{t("Try it yourself — a ready-made shop, no sign-up")}</p>
          <Link href="/demo" className="btn-primary-sm">
            {t("Try the demo")}
          </Link>
        </div>
        {transcript.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t("What is said in this video")}</h2>
            {transcript.map((part) => (
              <div key={part.start} className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-foreground">
                  <Link href={`/videos/${video.id}?t=${part.start}`} className="text-brand-text">
                    {mmss(part.start)}
                  </Link>{" "}
                  {part.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{part.text}</p>
              </div>
            ))}
          </section>
        )}
        {next.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">{t("More videos")}</p>
            {next.map((v) => (
              <Link
                key={v.id}
                href={`/videos/${v.id}${type ? `?type=${encodeURIComponent(type)}` : ""}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">{v.title}</span>
                <span className="shrink-0 text-xs text-muted">{mmss(v.seconds)}</span>
              </Link>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
