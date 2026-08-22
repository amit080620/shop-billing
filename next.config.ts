import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Genuinely raised from the 1MB default — a real medicine
      // database CSV/Excel import (thousands of rows, each with long
      // description/side-effects text) genuinely needs more room.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
