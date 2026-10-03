import Link from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { VERTICALS, verticalHref } from "@/lib/seo/verticals";

/** The frame of the public pages people reach from a search: The Ray's logo, log in, the free trial,
 * and a footer linking every trade's page, the GST calculator and the training videos — so a
 * visitor (and a search engine) can reach all of them from any one. Plain server-rendered HTML. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-white" style={{ background: "#08061a" }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <Link href="/" aria-label="The Ray home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="The Ray" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white/85">
            Log in
          </Link>
          <Link href="/signup" className="hidden items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#150f33] sm:flex">
            Start free <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-5xl border-t border-white/10 px-5 py-10 text-sm">
        <p className="font-semibold text-white/80">Billing software for</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
          {VERTICALS.map((v) => (
            <li key={v.slug}>
              <a href={verticalHref(v)} className="text-white/55 hover:text-white">
                {v.h1.replace(/^(Billing )?[Ss]oftware for /, "").replace(/^./, (c) => c.toUpperCase())}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-white/55">
          <Link href="/gst-calculator" className="hover:text-white">GST calculator</Link>
          <Link href="/videos" className="hover:text-white">Training videos</Link>
          <Link href="/demo" className="hover:text-white">Live demo</Link>
          <Link href="/terms" className="hover:text-white">Terms &amp; refund policy</Link>
          <Link href="/privacy-policy" className="hover:text-white">Privacy</Link>
        </p>
        <p className="mt-6 text-xs text-white/35">The Ray — billing, GST and udhar for every kind of shop in India.</p>
      </footer>
    </div>
  );
}
