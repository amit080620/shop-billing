import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { DEMO_BUSINESSES } from "@/lib/demo/config";

export const metadata: Metadata = {
  title: "Try The Ray: live demo for every business",
  description: "Open a ready-made shop for your kind of business and try billing, GST, udhaar, stock and reports with sample data. No sign-up.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
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

        <section aria-label="Demos" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_BUSINESSES.map((b) => {
            const Icon = BUSINESS_TYPES.find((t) => t.value === b.type)?.icon;
            const colors = BUSINESS_TYPES.find((t) => t.value === b.type)?.colors ?? ["#6366f1", "#4338ca"];
            return (
              // A plain link on purpose: opening a demo signs you in, which must not happen on a prefetch.
              <a key={b.type} href={`/demo/enter/${b.type}`} className="neu-card group flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}>
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
