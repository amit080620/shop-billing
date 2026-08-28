import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
