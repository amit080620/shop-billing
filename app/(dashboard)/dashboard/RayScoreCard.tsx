import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { computeTodaysMoves } from "@/lib/rayMoves";
import type { Lang } from "@/lib/i18n/dictionary";

/** No billing app shows an owner a single "how's my shop doing" number —
 * they show scattered alert banners per screen and leave the owner to
 * mentally rank them. This turns every signal already in the product
 * (overdue udhar, lapsed regulars, low stock, expiring batches, and a
 * handful of business-specific ones) into one score and the 3 things
 * most worth doing about it right now, each one tap from the fix. */
export async function RayScoreCard({ shopId, businessType, lang, t }: { shopId: string; businessType: string; lang: Lang; t: (key: string, values?: Record<string, string | number>) => string }) {
  const { score, moves } = await computeTodaysMoves(shopId, businessType, lang);
  const color = score >= 75 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
  const colorSoft = score >= 75 ? "var(--success-soft)" : score >= 50 ? "var(--warning-soft)" : "var(--danger-soft)";

  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3.5">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--border) 0deg)` }}
        >
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full" style={{ background: "var(--surface)" }}>
            <span className="text-lg font-bold tracking-tight text-foreground">{score}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles size={14} style={{ color }} />
            {t("rayScore.title")}
          </p>
          {score === 100 && <p className="mt-0.5 text-xs text-muted">{t("rayScore.allCaughtUp")}</p>}
        </div>
      </div>

      {moves.length > 0 && (
        <ul className="flex flex-col gap-2">
          {moves.map((move, i) => (
            <li key={move.id}>
              <Link href={move.href} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover-lift">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: colorSoft, color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{move.title}</span>
                  <span className="block truncate text-xs text-muted">{move.detail}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
