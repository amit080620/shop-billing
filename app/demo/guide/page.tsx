import type { Metadata } from "next";
import Link from "next/link";
import { guideBlocks } from "@/lib/demo/guide";
import { demoPublicLinks } from "@/lib/demo/links";

export const metadata: Metadata = {
  title: "The Ray demo guide",
  description: "What every screen of The Ray does and in what order to show it, for anyone recording a video or writing a review.",
  alternates: { canonical: "/demo/guide" },
};

// Refreshed every hour: it lists live links that change when the demos are refilled.
export const revalidate = 3600;

const BASE = "https://bill.theray.in";

export default async function DemoGuidePage() {
  const blocks = guideBlocks(BASE, await demoPublicLinks(BASE));
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/demo" className="text-sm font-medium text-brand-text">
            &larr; All demos
          </Link>
          <Link href="/demo/guide.md" className="text-xs text-muted underline">
            Plain text version
          </Link>
        </div>
        <article className="flex flex-col gap-3">
          {blocks.map((b, i) => {
            if ("h" in b) {
              if (b.h === 1) return <h1 key={i} className="text-3xl font-bold tracking-tight text-foreground">{b.text}</h1>;
              if (b.h === 2) return <h2 key={i} className="mt-6 text-xl font-bold text-foreground">{b.text}</h2>;
              return <h3 key={i} className="mt-4 text-base font-semibold text-foreground">{b.text}</h3>;
            }
            if ("p" in b) return <p key={i} className="text-sm leading-relaxed text-muted">{b.p}</p>;
            if ("ul" in b)
              return (
                <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground">
                  {b.ul.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              );
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-foreground">
                {b.code}
              </pre>
            );
          })}
        </article>
      </div>
    </div>
  );
}
