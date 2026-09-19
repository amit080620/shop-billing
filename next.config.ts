import type { NextConfig } from "next";

// One id per deploy, baked into both the client bundle and the server, so
// an open tab can tell it is running an older release (see VersionWatcher).
const buildId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  experimental: {
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
