import type { Metadata } from "next";
import Link from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/app/components/MarketingShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumbs, faqPage, graph, organization, SITE_URL } from "@/lib/seo/site";
import { GstCalculator } from "./GstCalculator";

const DESCRIPTION =
  "Free GST calculator for India: add GST to a price or remove GST from an inclusive price, with the CGST, SGST and IGST split, at 5%, 18%, 40% or any rate. Formula and examples.";

export const metadata: Metadata = {
  title: { absolute: "GST Calculator — Add or Remove GST, CGST/SGST/IGST | The Ray" },
  description: DESCRIPTION,
  keywords: ["GST calculator", "GST calculator India", "reverse GST calculator", "CGST SGST calculator", "IGST calculator", "GST inclusive calculator"],
  alternates: { canonical: "/gst-calculator" },
  openGraph: { title: "Free GST calculator", description: DESCRIPTION, url: `${SITE_URL}/gst-calculator` },
};

const FAQS = [
  {
    q: "How do I add GST to a price?",
    a: "Multiply the price by the GST rate and divide by 100; that is the GST. Add it to the price for the total. For ₹1,000 at 18%: GST = 1,000 × 18 ÷ 100 = ₹180, total ₹1,180.",
  },
  {
    q: "How do I remove GST from a price that includes it?",
    a: "Divide the inclusive price by (1 + rate ÷ 100) to get the price before GST; the rest is GST. For ₹1,180 at 18%: 1,180 ÷ 1.18 = ₹1,000 before GST, so GST is ₹180.",
  },
  {
    q: "When is it CGST + SGST and when is it IGST?",
    a: "A sale within your own state carries CGST and SGST, each half of the rate (18% = 9% CGST + 9% SGST). A sale to a buyer in another state carries the whole rate as IGST.",
  },
  {
    q: "What are the GST rates now?",
    a: "From 22 September 2025 most goods and services fall under 5% or 18%, with 40% for a small list of luxury and sin goods; some items are exempt (0%) and gold and jewellery are at 3%. Rates depend on the item's HSN or SAC code, so check yours — the calculator also takes any other rate.",
  },
  {
    q: "Does my bill need to show the GST split?",
    a: "A GST invoice shows the taxable value and the CGST and SGST (or IGST) amounts with their rates. Billing software such as The Ray works this out and prints it on every bill for you.",
  },
];

/** A free GST calculator: a tool people search for every day, and a way to The Ray. */
export default function GstCalculatorPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={graph(
          organization,
          {
            "@type": "WebApplication",
            name: "GST Calculator",
            url: `${SITE_URL}/gst-calculator`,
            description: DESCRIPTION,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: 0, priceCurrency: "INR" },
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          faqPage(FAQS),
          breadcrumbs([
            { name: "The Ray", path: "/" },
            { name: "GST calculator", path: "/gst-calculator" },
          ]),
        )}
      />
      <section className="mx-auto max-w-5xl px-5 pb-6 pt-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">GST calculator</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/70">
          Add GST to a price or take it out of a price that already includes it, and see the CGST and SGST (or IGST) split — free, no sign-up.
        </p>
      </section>
      <section className="mx-auto max-w-5xl px-5 pb-8">
        <GstCalculator />
      </section>
      <section className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Make GST bills without working it out</h2>
            <p className="mt-1 text-sm text-white/60">The Ray adds the right GST, prints the split on every bill, and makes GSTR-1 and GSTR-3B from them. Free 14-day trial.</p>
          </div>
          <Link href="/signup" className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#150f33]">
            Start free <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-5 py-8">
        <h2 className="text-xl font-semibold">How GST is calculated</h2>
        <div className="mt-4 grid gap-3 text-sm leading-relaxed text-white/70">
          <p>
            <strong className="text-white">Adding GST:</strong> GST = price × rate ÷ 100, and total = price + GST.
          </p>
          <p>
            <strong className="text-white">Removing GST:</strong> price before GST = total ÷ (1 + rate ÷ 100), and GST = total − price before GST.
          </p>
          <p>
            <strong className="text-white">Splitting it:</strong> within your state, half is CGST and half SGST; to another state, all of it is IGST.
          </p>
        </div>
        <h2 className="mt-10 text-xl font-semibold">Questions</h2>
        <div className="mt-4 flex flex-col gap-2">
          {FAQS.map((f) => (
            <details key={f.q} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
