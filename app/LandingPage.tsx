import Link from "next/link";
import {
  ShoppingCart, Store, Wrench, Pill, UtensilsCrossed, Repeat, Truck, Hammer,
  Scissors, Gem, Stethoscope, Dumbbell, FlaskConical, Building2,
  Sparkles, MessageCircle, Wifi, Languages, Receipt, ShieldCheck, ArrowRight,
} from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";

const BUSINESSES = [
  { icon: ShoppingCart, label: "Grocery / Kirana" },
  { icon: Store, label: "Supermarket / Mart" },
  { icon: Wrench, label: "Hardware / Electrical" },
  { icon: Pill, label: "Pharmacy / Medical" },
  { icon: UtensilsCrossed, label: "Restaurant / Café" },
  { icon: Repeat, label: "Rental business" },
  { icon: Truck, label: "Transport & Materials" },
  { icon: Hammer, label: "Repair & Services" },
  { icon: Scissors, label: "Salon / Spa" },
  { icon: Gem, label: "Jewellery" },
  { icon: Stethoscope, label: "Clinic / Doctor" },
  { icon: Dumbbell, label: "Gym / Fitness" },
  { icon: FlaskConical, label: "Lab / Diagnostics" },
  { icon: Building2, label: "General / Other" },
];

/** The app's actual front door for anyone who ISN'T already a shop
 * owner — everything else on this domain sits behind requireSession
 * and redirects a stranger straight to a bare login form with zero
 * context. That's a real reason a shared link converts nobody: there
 * was nothing here to explain what this even is, what it costs, or
 * why to bother typing in a password. This is deliberately static,
 * fast, server-rendered marketing copy — no client JS beyond plain
 * links — so it loads instantly on a mid-range phone on 4G. */
export async function LandingPage() {
  const { t, lang } = await getTranslator();

  const FEATURES = [
    { icon: Sparkles, title: t("landing.feature.rayScore.title"), body: t("landing.feature.rayScore.body") },
    { icon: Receipt, title: t("landing.feature.gst.title"), body: t("landing.feature.gst.body") },
    { icon: MessageCircle, title: t("landing.feature.whatsapp.title"), body: t("landing.feature.whatsapp.body") },
    { icon: Wifi, title: t("landing.feature.offline.title"), body: t("landing.feature.offline.body") },
    { icon: Languages, title: t("landing.feature.language.title"), body: t("landing.feature.language.body") },
    { icon: ShieldCheck, title: t("landing.feature.secure.title"), body: t("landing.feature.secure.body") },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#08061a" }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="The Ray" className="h-8 w-auto" />
        </span>
        <div
          className="flex items-center gap-3"
          style={
            {
              "--surface": "rgba(255,255,255,0.1)",
              "--border": "rgba(255,255,255,0.15)",
              "--brand-soft": "rgba(255,255,255,0.18)",
              "--brand-text": "#ffffff",
              "--muted": "rgba(255,255,255,0.7)",
              "--foreground": "#ffffff",
            } as React.CSSProperties
          }
        >
          <div className="hidden sm:block">
            <LanguageToggle lang={lang} />
          </div>
          <Link href="/login" className="rounded-lg border border-white/20 px-3.5 py-2 text-sm font-medium text-white/85 hover:bg-white/10">
            {t("landing.login")}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden px-5 pb-16 pt-10 text-center sm:pt-16"
        style={{ background: "radial-gradient(ellipse 140% 70% at 50% -10%, #241f52 0%, #150f33 45%, transparent 100%)" }}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85">
          <Sparkles size={13} className="text-brand-light" />
          {t("landing.trialBadge")}
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {t("landing.headline")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/65 sm:text-lg">
          {t("landing.subheadline")}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-[#150f33] shadow-lg sm:w-auto"
          >
            {t("landing.cta.primary")} <ArrowRight size={18} />
          </Link>
          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-base font-medium text-white/85 sm:w-auto"
          >
            {t("landing.cta.secondary")}
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/40">{t("landing.noCard")}</p>
      </section>

      {/* Business types */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <p className="text-center text-sm font-medium text-white/50">{t("landing.builtFor")}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-7">
          {BUSINESSES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-3.5 text-center">
              <Icon size={18} className="text-brand-light" />
              <span className="text-[11px] leading-tight text-white/70">{t(label)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-brand-light">
                <Icon size={19} />
              </span>
              <p className="mt-3 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing / trust */}
      <section className="mx-auto max-w-3xl px-5 py-12 text-center">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
          <p className="text-lg font-semibold text-white">{t("landing.pricing.title")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/60">{t("landing.pricing.body")}</p>
          <Link
            href="/signup"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#150f33] shadow-lg"
          >
            {t("landing.cta.primary")} <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-5 py-8 text-center text-xs text-white/35">
        <p>{t("landing.footer.tagline")}</p>
        <Link href="/privacy-policy" className="hover:text-white/60">{t("landing.footer.privacy")}</Link>
      </footer>
    </div>
  );
}
