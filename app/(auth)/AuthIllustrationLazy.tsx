"use client";

import dynamic from "next/dynamic";

export const AuthIllustrationLazy = dynamic(
  () => import("./AuthIllustration").then((m) => ({ default: m.AuthIllustration })),
  { ssr: false, loading: () => <div className="h-40 w-full md:h-full" /> },
);
