import type { NextConfig } from "next";

// One id per deploy, baked into both the client bundle and the server, so
// an open tab can tell it is running an older release (see VersionWatcher).
const buildId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  // Published so error reports (Sentry) show the real line of code instead of minified bundles.
  // Phones never download them; the source is public on GitHub anyway.
  productionBrowserSourceMaps: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  experimental: {
    // How long a screen loaded ahead (the bottom bar's billing screens) is used as it is before
    // being fetched again — short, so stock and customer lists are never far behind.
    staleTimes: { static: 120 },
    serverActions: {
      // Genuinely raised from the 1MB default — a real medicine
      // database CSV/Excel import (thousands of rows, each with long
      // description/side-effects text) genuinely needs more room.
      bodySizeLimit: "10mb",
    },
    // Genuinely optimize lucide-react imports so Next.js only bundles
    // the exact icons each page uses (barrel-import tree-shaking).
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Genuinely enables gzip/brotli compression for all responses —
  // measurably reduces transfer size for JS, CSS, and HTML.
  compress: true,
  // The main site (www.theray.in) has a page for each trade; this site's copies send people and
  // search engines there, so the two never compete. Wholesale has no page there and stays here.
  async redirects() {
    const trades: Record<string, string> = {
      "kirana-store": "kirana-grocery-store",
      "supermarket": "supermarket",
      "hardware-shop": "hardware-shop",
      "medical-store": "pharmacy-medical-store",
      "restaurant": "restaurant-cafe",
      "hotel": "hotel-lodge",
      "rental-business": "rental-business",
      "transport-and-building-material": "transport-sand-materials",
      "repair-shop": "repair-service-center",
      "salon-and-spa": "salon-spa",
      "jewellery-shop": "jewellery-shop",
      "clinic-and-doctor": "clinic-doctor",
      "gym": "gym-fitness",
      "pathology-lab": "lab-diagnostics",
      "general-store": "general-store"
    };
    return [
      { source: "/billing-software", destination: "https://www.theray.in/billing-software", permanent: true },
      ...Object.entries(trades).map(([here, there]) => ({ source: `/billing-software/${here}`, destination: `https://www.theray.in/billing-software/${there}`, permanent: true })),
    ];
  },
  images: {
    remotePatterns: [
      // Wildcard covers any Supabase project's storage domain
      // (product photos, logos, shelf-watch photos, etc.) without
      // hardcoding one specific project ref.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
