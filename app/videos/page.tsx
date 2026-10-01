import type { Metadata } from "next";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { getTranslator } from "@/lib/i18n/server";
import { VideoList } from "@/app/components/VideoList";
import { TRAINING_VIDEOS, videosFor } from "@/lib/trainingVideos";

export const metadata: Metadata = {
  title: "The Ray training videos: billing, GST, udhaar, stock",
  description: "Short Hinglish videos showing every screen of The Ray, business by business. Free to watch, no login.",
  alternates: { canonical: "/videos" },
};

/** The training videos without a login — the link a shop owner or their staff gets on WhatsApp.
 * `?type=` puts that business's own videos first. */
export default async function PublicVideosPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const { t } = await getTranslator();
  const picked = BUSINESS_TYPES.find((b) => b.value === type)?.value ?? null;
  const { own, common, other } = picked ? videosFor(picked) : { own: [], common: TRAINING_VIDEOS.filter((v) => v.for === "all"), other: TRAINING_VIDEOS.filter((v) => v.for !== "all") };
  const href = (id: string) => `/videos/${id}${picked ? `?type=${picked}` : ""}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
          <img src="/brand-logo.png" alt="The Ray" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/demo" className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
            {t("Try the demo")}
          </Link>
          <Link href="/signup" className="btn-primary-sm">
            {t("login.setOneUp")}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-16">
        <section className="pt-2 text-center">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <PlayCircle size={24} className="text-brand" /> {t("Training videos")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("Short Hinglish videos — every screen, step by step")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">{t("Your business")}</p>
          <div className="flex flex-wrap gap-1.5">
            <Link href="/videos" className={`rounded-full border px-3 py-1 text-xs font-medium ${picked ? "border-border text-muted" : "border-brand bg-brand-soft text-brand-text"}`}>
              {t("All")}
            </Link>
            {BUSINESS_TYPES.map((b) => (
              <Link key={b.value} href={`/videos?type=${b.value}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${picked === b.value ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {t(b.label)}
              </Link>
            ))}
          </div>
        </section>

        {own.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t("For your business")}</h2>
            <VideoList videos={own} href={href} />
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("For every shop")}</h2>
          <VideoList videos={common} href={href} />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{picked ? t("Other businesses ({n})", { n: other.length }) : t("Business by business")}</h2>
          <VideoList videos={other} href={href} />
        </section>
      </main>
    </div>
  );
}
