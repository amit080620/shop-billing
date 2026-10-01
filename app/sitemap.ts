import type { MetadataRoute } from "next";
import { TRAINING_VIDEOS } from "@/lib/trainingVideos";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://bill.theray.in";
  return [
    { url: `${base}/videos`, changeFrequency: "monthly", priority: 0.6 },
    ...TRAINING_VIDEOS.map((v) => ({ url: `${base}/videos/${v.id}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/demo`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/demo/guide`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${base}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
