import { planFor, type PlanKey } from "@/lib/plans";

/** The plan a shop is on, as a small coloured pill. Each plan has its own
 * colour (Free grey, Basic green, Pro indigo, Pro + gold, Custom pink) so
 * the tier reads at a glance — in the header, on the Plan screen, and in
 * the admin panel. `dark` swaps in a version legible on dark surfaces. */
export function PlanBadge({ plan, size = "sm", className = "" }: { plan: PlanKey; size?: "xs" | "sm" | "md"; className?: string }) {
  const p = planFor(plan);
  const sizing = size === "xs" ? "px-1.5 py-px text-[10px]" : size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold leading-tight tracking-wide ${sizing} ${className}`}
      style={{ background: p.badge.bg, color: p.badge.text, borderColor: p.badge.border }}
    >
      {p.badge.label}
    </span>
  );
}
