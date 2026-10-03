import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { ArrowRight, CheckCircle2, PlayCircle } from "lucide-react";
import { MarketingShell } from "@/app/components/MarketingShell";
import { JsonLd } from "@/app/components/JsonLd";
import { MAIN_SITE_TRADES, VERTICALS, verticalBySlug, verticalHref } from "@/lib/seo/verticals";
import { commonFaqs } from "@/lib/seo/commonFaqs";
import { breadcrumbs, faqPage, graph, organization, SITE_URL, softwareApplication } from "@/lib/seo/site";
import { mmss, videoById, videoFiles } from "@/lib/trainingVideos";

export function generateStaticParams() {
  return VERTICALS.filter((v) => !v.mainSite).map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const v = verticalBySlug((await params).slug);
  if (!v || v.mainSite) return { title: "Not found" };
  return {
    title: { absolute: `${v.title} | The Ray` },
    description: v.description,
    keywords: v.alsoKnownAs,
    alternates: { canonical: `/billing-software/${v.slug}` },
    openGraph: { title: v.title, description: v.description, url: `${SITE_URL}/billing-software/${v.slug}`, type: "website", images: [videoFiles(v.videos[0]).poster] },
  };
}

const EVERY_PLAN = ["GST and non-GST bills, A4 or thermal", "Bills and reminders on WhatsApp", "Udhar khata for every customer", "Works offline when the internet drops", "English, Hindi and Marathi", "Android app and any browser"];

/** "Billing software for <trade>": what a shop owner searching for software for their trade finds. */
export default async function VerticalPage({ params }: { params: Promise<{ slug: string }> }) {
  const v = verticalBySlug((await params).slug);
  // A trade the main site has a page for is redirected there (next.config) before reaching this.
  if (!v || v.mainSite) notFound();
  const faqs = [...v.faqs, ...commonFaqs(v.type, v.trade)];
  const videos = v.videos.map((id) => videoById(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const others = VERTICALS.filter((o) => o.slug !== v.slug);
  const url = `${SITE_URL}/billing-software/${v.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        data={graph(
          organization,
          softwareApplication({ name: `The Ray — ${v.title}`, description: v.description, url, businessType: v.type }),
          faqPage(faqs),
          breadcrumbs([
            { name: "The Ray", path: "/" },
            { name: v.h1, path: `/billing-software/${v.slug}` },
          ]),
        )}
      />
      <nav aria-label="Breadcrumb" className="mx-auto max-w-5xl px-5 text-xs text-white/45">
        <Link href="/">The Ray</Link> › <a href={MAIN_SITE_TRADES}>Billing software</a> › <span className="text-white/70">{v.trade}</span>
      </nav>

      <section className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{v.h1}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">{v.intro}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-[#150f33]">
            Start free 14-day trial <ArrowRight size={18} />
          </Link>
          <Link href={`/demo/enter/${v.type}`} rel="nofollow" className="flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-base font-medium text-white/85">
            Try the {v.trade} demo — no sign-up
          </Link>
        </div>
        <p className="mt-3 text-xs text-white/45">No card needed · Free plan after the trial · Also called: {v.alsoKnownAs.join(", ")}</p>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="text-xl font-semibold">What The Ray does for a {v.trade}</h2>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {v.features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {videos.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 py-8">
          <h2 className="text-xl font-semibold">See it working</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {videos.map((video) => (
              <Link key={video.id} href={`/videos/${video.id}`} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                {/* The recordings are of a phone screen: a tall thumbnail. */}
                <div className="relative w-24 shrink-0 overflow-hidden rounded-lg bg-black/40" style={{ aspectRatio: "720 / 1558" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={videoFiles(video.id).poster} alt={video.title} loading="lazy" className="h-full w-full object-cover" />
                  <PlayCircle size={34} className="absolute inset-0 m-auto text-white/90" />
                </div>
                <div className="min-w-0 py-1">
                  <p className="text-sm font-semibold">{video.title}</p>
                  <p className="mt-1 text-xs text-white/45">{mmss(video.seconds)} · in Hinglish, with subtitles</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">{video.topics.slice(0, 6).map(([, t]) => t).join(" · ")}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="text-xl font-semibold">In every plan</h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {EVERY_PLAN.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-white/70">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-xl font-semibold">Questions {v.trade} owners ask</h2>
        <div className="mt-4 flex flex-col gap-2">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#150f33]">
            Start free 14-day trial <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-6">
        <h2 className="text-sm font-semibold text-white/70">The Ray for other businesses</h2>
        <p className="mt-2 flex flex-wrap gap-2">
          {others.map((o) => (
            <a key={o.slug} href={verticalHref(o)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white">
              {o.trade}
            </a>
          ))}
        </p>
      </section>
    </MarketingShell>
  );
}
