import type { Metadata } from "next";
import Link from "@/lib/link";
import { ArrowRight, BookOpen, PlayCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { DEMO_BUSINESSES } from "@/lib/demo/config";
import { VideoPlayer } from "@/app/components/VideoPlayer";
import { mainVideoFor, mmss, videoById, videoFiles } from "@/lib/trainingVideos";
import { loadYoutubeIds } from "@/lib/youtubeData";

export const metadata: Metadata = {
  title: "Try The Ray: live demo for every business",
  description: "Open a ready-made shop for your kind of business and try billing, GST, udhaar, stock and reports with sample data. No sign-up.",
  alternates: { canonical: "/demo" },
};

export default async function DemoPage() {
  const youtube = await loadYoutubeIds();
  const tour = videoById("01")!;
  const tourFiles = videoFiles(tour.id);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
          <img src="/brand-logo.png" alt="The Ray" className="h-8 w-auto" />
        </Link>
        <Link href="/signup" className="btn-primary-sm">
          Start free
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        <section className="py-8 text-center sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-muted">
            <Sparkles size={13} /> No sign-up. No card.
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Try The Ray with your kind of business</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted sm:text-lg">
            Pick a business below. You land inside a ready-made shop full of sample data: bills, customers, stock, and everything that business needs. Click around, make a bill, take a booking.
          </p>
        </section>

        <section aria-label="Tour video" className="mx-auto mb-10 flex max-w-sm flex-col gap-2">
          <p className="text-center text-sm font-semibold text-foreground">New here? Watch the {Math.round(tour.seconds / 60)}-minute tour first</p>
          <VideoPlayer
            lite
            showTopics={false}
            maxVh={58}
            src={tourFiles.mp4}
            poster={tourFiles.poster}
            vtt={tourFiles.vtt}
            youtubeId={youtube[tour.id] ?? null}
            topics={tour.topics}
            shareText="The Ray — billing app tour (Hinglish)"
            shareUrl={`https://bill.theray.in/videos/${tour.id}`}
            words={{
              play: `Watch the tour · ${mmss(tour.seconds)}`,
              topics: "",
              share: "Share this video on WhatsApp",
              subtitlesNote: "Hinglish voice, subtitles on.",
            }}
          />
          <Link href="/videos" className="self-center text-xs font-semibold text-brand-text">
            All training videos, business by business →
          </Link>
        </section>

        <section aria-label="Demos" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_BUSINESSES.map((b) => {
            const Icon = BUSINESS_TYPES.find((t) => t.value === b.type)?.icon;
            const colors = BUSINESS_TYPES.find((t) => t.value === b.type)?.colors ?? ["#6366f1", "#4338ca"];
            const video = mainVideoFor(b.type);
            return (
              <div key={b.type} className="neu-card flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5">
                {/* A plain link on purpose: opening a demo signs you in, which must not happen on a prefetch. */}
                <a href={`/demo/enter/${b.type}`} className="group flex flex-1 flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{
                        background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
                      }}
                    >
                      {Icon && <Icon size={22} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">{b.title}</p>
                      <p className="truncate text-xs text-muted">
                        {b.shopName} · {b.city}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted">{b.blurb}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text">
                    Open the demo <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
                {video && (
                  <Link
                    href={`/videos/${video.id}?type=${b.type}`}
                    className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground"
                  >
                    <PlayCircle size={14} className="text-brand" /> Watch the video · {mmss(video.seconds)}
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <div className="neu-card flex flex-col gap-1.5 p-4">
            <ShieldCheck size={18} className="text-brand-text" />
            <p className="text-sm font-semibold text-foreground">Safe to play with</p>
            <p className="text-xs text-muted">Each demo is its own shop with made-up data. It never touches a real business, and a few sensitive things (staff logins, uploads) are switched off.</p>
          </div>
          <div className="neu-card flex flex-col gap-1.5 p-4">
            <RefreshCw size={18} className="text-brand-text" />
            <p className="text-sm font-semibold text-foreground">Fresh every night</p>
            <p className="text-xs text-muted">The demos are wiped and refilled each night, so &quot;today&quot; is always today and nothing you add lasts.</p>
          </div>
          <div className="neu-card flex flex-col gap-1.5 p-4">
            <BookOpen size={18} className="text-brand-text" />
            <p className="text-sm font-semibold text-foreground">Making a video or a review?</p>
            <p className="text-xs text-muted">
              Read the <Link href="/demo/guide" className="font-semibold text-brand-text underline">full guide</Link> (also as <Link href="/demo/guide.md" className="font-semibold text-brand-text underline">plain text</Link>): what every screen does, in what order to show it.
            </p>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-muted">Opening a demo signs you out of any real shop you are logged in to on this device. Log back in afterwards.</p>
      </main>
    </div>
  );
}
