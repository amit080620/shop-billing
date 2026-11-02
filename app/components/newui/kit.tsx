import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "@/lib/link";

/** The New look's building blocks (THERAY_FINAL_DESIGN design system): page head, cards, KPI
 * tiles, chips, buttons, segment tabs, tables and a light SVG chart. Server components — no
 * script reaches the phone for them. Only used by New screens (lib/uiVersion). */

export type Tone = "brand" | "secondary" | "success" | "warning" | "danger" | "credit" | "neutral";

const CHIP: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-text",
  secondary: "bg-secondary-soft text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  credit: "bg-credit-soft text-credit",
  neutral: "bg-surface-2 text-muted",
};
const DOT: Record<Tone, string> = {
  brand: "bg-brand",
  secondary: "bg-secondary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  credit: "bg-credit",
  neutral: "bg-muted",
};

export function NChip({ tone = "neutral", dot, children, className = "" }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 ${CHIP[tone]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A soft pill showing a figure by its dot, as in the design's sales split ("● Cash: ₹38,200"). */
export function NDotValue({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs shadow-[var(--elevation-1)] ${tone === "credit" ? "font-semibold text-credit" : "text-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      {label}: {value}
    </span>
  );
}

type ButtonKind = "primary" | "gradient" | "secondary" | "ghost" | "danger";
const BUTTON: Record<ButtonKind, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  gradient: "n-gradient shadow-sm hover:opacity-95",
  secondary: "bg-surface-2 text-foreground hover:bg-brand-soft",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-95",
};

/** A link styled as one of the design's buttons. */
export function NButtonLink({ href, kind = "secondary", size = "md", icon: Icon, children, className = "" }: { href: string; kind?: ButtonKind; size?: "sm" | "md"; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const sizing = size === "sm" ? "h-7 gap-1 px-2.5 text-xs" : "h-9 gap-1.5 px-3.5 text-sm";
  return (
    <Link href={href} className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold transition-colors ${sizing} ${BUTTON[kind]} ${className}`}>
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} aria-hidden="true" />}
      {children}
    </Link>
  );
}

/** The page's title row: a small eyebrow chip, the title, a line under it, actions on the right. */
export function NPageHead({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="n-card relative overflow-hidden p-4 md:p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full opacity-60 blur-2xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%)" }} aria-hidden="true" />
      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>}
          <h1 className="n-h1 text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Today / Yesterday / This month and the like, as links that keep the page server-rendered. */
export function NSegment({ items, ariaLabel }: { items: { href: string; label: string; active: boolean }[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="flex items-center rounded-lg bg-surface-2 p-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${i.active ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** One of the KPI cards along the top of a board. */
export function NKpi({ label, labelTone, chip, value, aside, note, footer, accent, href }: {
  label: string;
  labelTone?: Tone;
  chip?: ReactNode;
  value: ReactNode;
  aside?: ReactNode;
  note?: ReactNode;
  footer?: ReactNode;
  /** The design's spectrum bar along the top edge (the first, most important card). */
  accent?: boolean;
  href?: string;
}) {
  const body = (
    <>
      {accent && <div className="n-gradient absolute inset-x-0 top-0 h-1" aria-hidden="true" />}
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className={`n-label ${labelTone === "credit" ? "text-credit" : labelTone === "danger" ? "text-danger" : "text-muted"}`}>{label}</span>
          {chip}
        </div>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
          <span className="n-kpi text-foreground">{value}</span>
          {aside}
        </div>
        {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      </div>
      {footer && <div className="n-well flex flex-wrap items-center justify-between gap-2 p-2">{footer}</div>}
    </>
  );
  const cls = "n-card relative flex flex-col justify-between overflow-hidden p-3.5 md:p-4";
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:shadow-[var(--elevation-2)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A titled card section: icon tile, title, a line under it, actions on the right. */
export function NSection({ icon: Icon, title, subtitle, actions, children, className = "", bodyClassName = "p-3.5 md:p-4" }: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`n-card flex flex-col overflow-hidden ${className}`}>
      <div className="flex flex-col gap-2 p-3.5 pb-0 sm:flex-row sm:items-center sm:justify-between md:p-4 md:pb-0">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Icon size={18} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="n-h2 text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Dense register table head/cell classes (design: uppercase mono head on a soft band). */
export const N_TH = "n-label whitespace-nowrap bg-surface-2 px-3.5 py-2.5 text-left text-muted";
export const N_TD = "px-3.5 py-2.5 align-middle text-sm text-foreground";

/** Bars (and a line over them) as plain SVG — no chart library on the phone. */
export function NBarChart({ points, height = 200, ariaLabel, highlight = 2 }: {
  points: { label: string; value: number; title?: string }[];
  height?: number;
  ariaLabel: string;
  /** How many of the tallest bars get the strong colour. */
  highlight?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const top = new Set([...points].sort((a, b) => b.value - a.value).slice(0, highlight).filter((p) => p.value > 0).map((p) => p.label));
  const w = 100 / Math.max(1, points.length);
  const line = points.map((p, i) => `${(i + 0.5) * w},${100 - (p.value / max) * 92}`).join(" ");
  return (
    <figure className="n-well flex flex-col p-3" aria-label={ariaLabel}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((p, i) => {
          const h = (p.value / max) * 92;
          return (
            <rect key={p.label} x={i * w + w * 0.2} y={100 - h} width={w * 0.6} height={h} rx="0.8" fill={top.has(p.label) ? "var(--secondary)" : "var(--brand)"} opacity={top.has(p.label) ? 0.9 : 0.35}>
              <title>{p.title ?? `${p.label}: ${p.value}`}</title>
            </rect>
          );
        })}
        <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-2 grid text-center" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <span key={p.label} className={`truncate text-[10px] font-semibold ${top.has(p.label) ? "text-secondary" : "text-muted"}`}>
            {p.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** A square quick-launch tile (design: "Fast counter keys"), without keyboard badges. */
export function NTile({ href, icon: Icon, title, sub, strong }: { href: string; icon: LucideIcon; title: string; sub?: string; strong?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex min-h-[96px] flex-col justify-between gap-2 rounded-xl p-3 transition-transform hover:-translate-y-0.5 ${strong ? "n-gradient shadow-md" : "bg-surface-2 text-foreground"}`}
    >
      <Icon size={22} strokeWidth={2} className={strong ? "text-white" : "text-brand-text"} aria-hidden="true" />
      <span>
        <span className="block text-sm font-bold leading-tight">{title}</span>
        {sub && <span className={`block text-[11px] ${strong ? "text-white/80" : "text-muted"}`}>{sub}</span>}
      </span>
    </Link>
  );
}
