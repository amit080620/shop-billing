import type { MetadataRoute } from "next";

/** Only the genuinely public pages are worth a search engine's time —
 * everything else needs a login anyway, so crawling it wastes crawl
 * budget and could index a page that just shows "log in" to Google. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/signup", "/privacy-policy"],
      disallow: ["/dashboard", "/bills", "/products", "/customers", "/reports", "/settings", "/admin", "/api", "/print", "/team"],
    },
    sitemap: "https://bill.theray.in/sitemap.xml",
  };
}
