import type { Metadata } from "next";
import Link from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/app/components/MarketingShell";
import { JsonLd } from "@/app/components/JsonLd";
import { VERTICALS } from "@/lib/seo/verticals";
import { breadcrumbs, graph, organization, SITE_URL, softwareApplication } from "@/lib/seo/site";

const DESCRIPTION =
  "GST billing software for every kind of Indian shop — kirana, supermarket, medical store, restaurant, hotel, salon, jewellery, hardware, clinic, gym, lab, rental, transport, wholesale. Udhar khata, stock, WhatsApp bills, Hindi. Free 14-day trial.";

export const metadata: Metadata = {
  title: { absolute: "Billing Software for Every Indian Shop — GST, Udhar & Stock | The Ray" },
  description: DESCRIPTION,
  alternates: { canonical: "/billing-software" },
  openGraph: { title: "Billing software for every Indian shop", description: DESCRIPTION, url: `${SITE_URL}/billing-software` },
};

/** Every trade The Ray is built for, each with its own page. */
export default function BillingSoftwareIndex() {
  return (
    <MarketingShell>
      <JsonLd
        data={graph(
          organization,
          softwareApplication({ description: DESCRIPTION, url: `${SITE_URL}/billing-software` }),
          breadcrumbs([
            { name: "The Ray", path: "/" },
            { name: "Billing software", path: "/billing-software" },
          ]),
          {
            "@type": "ItemList",
            itemListElement: VERTICALS.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/billing-software/${v.slug}`, name: v.title })),
          },
        )}
      />
      <section className="mx-auto max-w-5xl px-5 pb-6 pt-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Billing software for every kind of shop</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">
          One app for GST bills, udhar khata, stock and reports — set up for how your trade actually works. Pick yours to see what it does, watch it working, and try a ready-made demo shop.
        </p>
      </section>
      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-3 px-5 pb-10 sm:grid-cols-2 md:grid-cols-3">
        {VERTICALS.map((v) => (
          <Link key={v.slug} href={`/billing-software/${v.slug}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07]">
            <h2 className="text-sm font-semibold">{v.h1}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">{v.intro}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/80">
              See how it works <ArrowRight size={13} />
            </span>
          </Link>
        ))}
      </section>
    </MarketingShell>
  );
}
