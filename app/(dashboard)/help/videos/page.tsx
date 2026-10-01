import { PlayCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { VideoList } from "@/app/components/VideoList";
import { videosFor } from "@/lib/trainingVideos";

/** Every training video, this shop's own trade first. */
export default async function VideosPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const { own, common, other } = videosFor(session.businessType);
  const href = (id: string) => `/help/videos/${id}`;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/help" />
      <PageHeader title={t("Training videos")} subtitle={t("Short Hinglish videos — every screen, step by step")} icon={<PlayCircle size={18} strokeWidth={1.8} />} />
      <p className="text-xs text-muted">{t("Tip: tap ▶ at the top of any screen — it opens that screen's video at the right moment.")}</p>
      {own.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("For your shop")}</h2>
          <VideoList videos={own} href={href} />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("For every shop")}</h2>
        <VideoList videos={common} href={href} />
      </section>
      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer text-sm font-semibold text-muted">{t("Other businesses ({n})", { n: other.length })}</summary>
        <div className="mt-2">
          <VideoList videos={other} href={href} />
        </div>
      </details>
    </div>
  );
}
