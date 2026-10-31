import { PLAN_PRICES_LIVE } from "../sales";
import { offeredPlans, planPrice } from "../plans";

/** Facts about The Ray for search engines (schema.org JSON-LD) — the same on every public page. */
export const SITE_URL = "https://bill.theray.in";
export const MAIN_SITE_URL = "https://www.theray.in";
export const YOUTUBE_CHANNEL = "https://www.youtube.com/@theraybilling";
export const INSTAGRAM = "https://www.instagram.com/theray.billing/";

/** One company on both sites: the same @id as www.theray.in's Organization, so search engines read
 * the two as one brand (not two companies called The Ray). */
export const ORGANIZATION_ID = `${MAIN_SITE_URL}/#organization`;

export const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "The Ray",
  url: MAIN_SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  sameAs: [YOUTUBE_CHANNEL, INSTAGRAM],
};

/** Lowest and highest yearly price this kind of shop is offered, for the software's offer. */
function priceRange(businessType?: string): { low: number; high: number } {
  const paid = offeredPlans(businessType).filter((k) => k !== "free");
  const yearly = paid.map((k) => planPrice(k, businessType).yearly);
  return { low: Math.min(...yearly), high: Math.max(...yearly) };
}

/** The app as a SoftwareApplication. A free plan and a 14-day trial exist, and paid plans are
 * listed by yearly price when prices are public (PLAN_PRICES_LIVE). No ratings are claimed. */
export function softwareApplication(opts: { name?: string; description: string; url: string; businessType?: string }) {
  const { low, high } = priceRange(opts.businessType);
  return {
    "@type": "SoftwareApplication",
    name: opts.name ?? "The Ray",
    description: opts.description,
    url: opts.url,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Billing and invoicing",
    operatingSystem: "Android, Web",
    inLanguage: ["en-IN", "hi-IN", "mr-IN"],
    publisher: { "@id": ORGANIZATION_ID },
    offers: PLAN_PRICES_LIVE
      ? { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: 0, highPrice: high, offerCount: offeredPlans(opts.businessType).length, description: `Free plan; paid plans from ₹${low.toLocaleString("en-IN")} a year` }
      : { "@type": "Offer", price: 0, priceCurrency: "INR", description: "Free plan and 14-day free trial" },
  };
}

export function faqPage(faqs: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

/** One JSON-LD document holding several schema.org things. */
export const graph = (...nodes: object[]) => ({ "@context": "https://schema.org", "@graph": nodes });
