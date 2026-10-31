import type { Metadata } from "next";
import Link from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/app/components/MarketingShell";
import { JsonLd } from "@/app/components/JsonLd";
import { breadcrumbs, faqPage, graph, organization, ORGANIZATION_ID, SITE_URL } from "@/lib/seo/site";
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
    a: "Since 22 September 2025 most goods and services fall under 5% or 18%, with 40% for a short list of luxury and sin goods — from 1 February 2026 including cigarettes, pan masala and most tobacco, while bidis are at 18%. Gold and jewellery are at 3%, and some items are exempt (no GST). Rates depend on the item's HSN or SAC code, so check yours in the current CBIC notification — the calculator also takes any other rate.",
  },
  {
    q: "What is Jharkhand's GST state code?",
    a: "20. Every GSTIN registered in Jharkhand starts with 20, and a bill to a customer within Jharkhand carries CGST and SGST. A sale from Jharkhand to Bihar (state code 10) or West Bengal (19) carries IGST.",
  },
  {
    q: "Does my bill need to show the GST split?",
    a: "A GST invoice shows the taxable value and the CGST and SGST (or IGST) amounts with their rates. Billing software such as The Ray works this out and prints it on every bill for you.",
  },
];

/** Worked examples, each one checkable with the calculator above. */
const EXAMPLES = [
  { case: "Ranchi shop sells to a Ranchi customer — ₹1,000 + 18%", working: "GST = 1,000 × 18 ÷ 100 = ₹180 → CGST 9% ₹90 + SGST 9% ₹90", total: "₹1,180" },
  { case: "Price already includes 18% — MRP ₹118", working: "Before GST = 118 ÷ 1.18 = ₹100 → GST ₹18 (CGST ₹9 + SGST ₹9)", total: "₹118" },
  { case: "Daily-use item at 5% — ₹500 + 5%", working: "GST = 500 × 5 ÷ 100 = ₹25 → CGST 2.5% ₹12.50 + SGST 2.5% ₹12.50", total: "₹525" },
  { case: "Jharkhand trader sells to a buyer in Bihar — ₹10,000 + 18%", working: "Another state, so all of it is IGST: 10,000 × 18 ÷ 100 = ₹1,800", total: "₹11,800" },];

/** Indicative slabs only — the slab structure from 22 September 2025, with the tobacco changes from
 * 1 February 2026. An item's own rate comes from its HSN or SAC entry in the rate notifications. */
const SLABS = [
  { rate: "Nil / exempt", what: "No GST is charged. Exempt examples: fresh fruit and vegetables, unpacked fresh milk. Exempt and nil-rated supplies don't allow input tax credit." },
  { rate: "3%", what: "Gold, silver and jewellery" },
  { rate: "5%", what: "Many daily-use and essential goods" },
  { rate: "18%", what: "The standard rate: most other goods and services. Bidis are taxed at 18% from 1 February 2026." },
  { rate: "40%", what: "Specified luxury and sin goods, such as large cars, and certain beverages under HSN 2202 as listed in the rate notification (aerated waters and drinks with added sugar, sweetening or flavouring, and caffeinated beverages — not every drink; milk-based and nutritional drinks are taxed lower). From 1 February 2026 this also covers cigarettes, pan masala and most other tobacco products (the compensation cess on them ended)." },
];

/** Pages for the businesses that use this calculator most. */
const TRADE_LINKS = [
  { href: "https://www.theray.in/billing-software/kirana-grocery-store", label: "Kirana & grocery billing" },
  { href: "https://www.theray.in/billing-software/pharmacy-medical-store", label: "Pharmacy billing" },
  { href: "https://www.theray.in/billing-software/restaurant-cafe", label: "Restaurant billing" },
  { href: "https://www.theray.in/billing-software/hardware-shop", label: "Hardware shop billing" },
  { href: "/billing-software/wholesale-distributor", label: "Wholesale & distributor billing" },
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
            publisher: { "@id": ORGANIZATION_ID },
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

        <h2 className="mt-10 text-xl font-semibold">GST calculation examples</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-white/[0.04] text-white/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Sale</th>
                <th scope="col" className="px-4 py-3 font-medium">Working</th>
                <th scope="col" className="px-4 py-3 font-medium">Bill total</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((e) => (
                <tr key={e.case} className="border-t border-white/10 align-top">
                  <th scope="row" className="px-4 py-3 font-medium text-white">{e.case}</th>
                  <td className="px-4 py-3 text-white/70">{e.working}</td>
                  <td className="px-4 py-3 font-semibold text-white">{e.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-xl font-semibold">Indicative GST rate slabs in India</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          An illustration of the main slabs as of October 2026 — not a complete HSN- or SAC-wise rate list.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-white/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Rate</th>
                <th scope="col" className="px-4 py-3 font-medium">Applies to (broadly)</th>
              </tr>
            </thead>
            <tbody>
              {SLABS.map((s) => (
                <tr key={s.rate} className="border-t border-white/10">
                  <th scope="row" className="px-4 py-3 font-semibold text-white">{s.rate}</th>
                  <td className="px-4 py-3 text-white/70">{s.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 text-xs leading-relaxed text-white/50">
          <p>
            <strong className="text-white/70">Not the same as zero-rated:</strong> exports and supplies to SEZ units are zero-rated — no GST
            on the sale, but the supplier can still claim input tax credit or a refund. Exempt and nil-rated supplies carry no GST and no
            input tax credit. Some goods, such as petrol, diesel and alcohol for drinking, are outside GST altogether.
          </p>
          <p>
            Rates are set by GST Council recommendations and notified by CBIC, and they change. Before billing, check your item&apos;s HSN
            (goods) or SAC (services) entry in the current rate notification, or ask your CA. Official sources:{" "}
            <a href="https://cbic-gst.gov.in/gst-goods-services-rates.html" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">CBIC GST rates</a>
            {" "}·{" "}
            <a href="https://taxinformation.cbic.gov.in/" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">CBIC notifications</a>
            {" "}·{" "}
            <a href="https://gstcouncil.gov.in/" target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">GST Council</a>.
          </p>
        </div>

        <section lang="hi" className="mt-10">
          <h2 className="text-xl font-semibold">GST कैसे निकालें — आसान तरीका</h2>
          <div className="mt-4 grid gap-3 text-sm leading-relaxed text-white/70">
            <p>
              <strong className="text-white">GST जोड़ना:</strong> कीमत × GST रेट ÷ 100 = GST। जैसे ₹1,000 पर 18% GST = ₹180, कुल बिल ₹1,180।
            </p>
            <p>
              <strong className="text-white">GST वाली कीमत से GST निकालना:</strong> कुल कीमत ÷ (1 + रेट ÷ 100) = बिना GST की कीमत। जैसे ₹1,180 ÷ 1.18 = ₹1,000, यानी GST ₹180।
            </p>
            <p>
              <strong className="text-white">CGST, SGST या IGST:</strong> झारखंड के अंदर बिक्री (जैसे रांची से धनबाद) पर आधा CGST और आधा SGST लगता है — 18% = 9% + 9%।
              दूसरे राज्य (जैसे बिहार या पश्चिम बंगाल) में बिक्री पर पूरा IGST लगता है।
            </p>
            <p>
              ऊपर का कैलकुलेटर यही हिसाब अपने-आप करता है। हर बिल पर यह हिसाब, और महीने के अंत में GSTR-1 और GSTR-3B, The Ray बिलिंग ऐप बना देता है।
            </p>
          </div>
        </section>

        <h2 className="mt-10 text-xl font-semibold">GST billing for your business</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          The Ray does this calculation on every bill and keeps the GST reports ready. See how it works for your kind of business, or{" "}
          <Link href="/demo" className="text-sky-300 underline underline-offset-4">try the live demo</Link> or the{" "}
          <Link href="/videos" className="text-sky-300 underline underline-offset-4">training videos</Link>.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {TRADE_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-block rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:border-white/40">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href="https://www.theray.in/billing-software" className="inline-block rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:border-white/40">
              GST billing software
            </a>
          </li>
        </ul>

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
