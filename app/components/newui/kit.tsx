import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "@/lib/link";

/** The New look's building blocks (THERAY_FINAL_DESIGN design system): page head, cards, KPI
 * tiles, chips, buttons, segment tabs, tables, alert cards and a light SVG sales chart. Server
 * components — no script reaches the phone for them. Only used by New screens (lib/uiVersion). */

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

/** A rupee figure to the rupee, as the design's headline cards write it (₹84,650). */
export function rupees(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "−" : ""}₹${Math.abs(r).toLocaleString("en-IN")}`;
}

/** A small label pill in the design's mono (label-tax). `square` is the register's mode tag. */
export function NChip({ tone = "neutral", dot, square, children, className = "" }: { tone?: Tone; dot?: boolean; square?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`n-tax inline-flex shrink-0 items-center gap-1 px-2 py-0.5 font-bold ${square ? "rounded" : "rounded-full"} ${CHIP[tone]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A soft pill showing a figure by its dot, as in the design's sales split ("● Cash: ₹38,200"). */
export function NDotValue({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <span className={`n-tax inline-flex items-center gap-1.5 rounded bg-surface px-2 py-1 shadow-[var(--elevation-1)] ${tone === "credit" ? "font-bold text-credit" : "text-foreground"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      {label}: {value}
    </span>
  );
}

type ButtonKind = "primary" | "gradient" | "secondary" | "ghost" | "danger" | "credit";
const BUTTON: Record<ButtonKind, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  gradient: "n-gradient shadow-md hover:opacity-95",
  secondary: "bg-surface-2 text-foreground hover:bg-brand-soft",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-95",
  credit: "bg-credit text-[color:var(--on-credit)] hover:opacity-95",
};

/** A link styled as one of the design's buttons. */
export function NButtonLink({ href, kind = "secondary", size = "md", icon: Icon, children, className = "", kbd }: { href: string; kind?: ButtonKind; size?: "xs" | "sm" | "md"; icon?: LucideIcon; children: ReactNode; className?: string; kbd?: string }) {
  const sizing = size === "xs" ? "h-7 gap-1 rounded px-2.5 text-[11px]" : size === "sm" ? "h-8 gap-1 rounded-lg px-3 text-xs" : "h-9 gap-1.5 rounded-lg px-3.5 text-[13px]";
  return (
    <Link href={href} className={`inline-flex shrink-0 items-center justify-center font-bold transition-colors ${sizing} ${BUTTON[kind]} ${className}`}>
      {Icon && <Icon size={size === "md" ? 16 : 14} strokeWidth={2.2} aria-hidden="true" />}
      {children}
      {kbd && <kbd className="n-tax hidden rounded bg-white/20 px-1 text-[10px] md:inline">{kbd}</kbd>}
    </Link>
  );
}

/** The page's title row: a small eyebrow chip, the title, a line under it, actions on the right. */
export function NPageHead({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="n-card relative overflow-hidden p-4 md:p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full blur-2xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand) 12%, transparent), color-mix(in srgb, var(--secondary) 6%, transparent) 45%, transparent 70%)" }} aria-hidden="true" />
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

/** Today / Yesterday / This month and the like, as links that keep the page server-rendered. The
 * chosen one is filled (the owner's rule: a white pill on grey can't be told apart). */
export function NSegment({ items, ariaLabel, className = "" }: { items: { href: string; label: string; active: boolean }[]; ariaLabel: string; className?: string }) {
  return (
    <nav aria-label={ariaLabel} className={`flex items-center rounded-lg bg-surface-2 p-1 ${className}`}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-xs font-bold transition-colors ${i.active ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** One of the KPI cards along the top of a board. */
export function NKpi({ label, labelTone, chip, value, valueTitle, aside, note, footer, footerTone, accent, href }: {
  label: string;
  labelTone?: Tone;
  chip?: ReactNode;
  value: ReactNode;
  /** The exact figure, when the card shows it rounded. */
  valueTitle?: string;
  aside?: ReactNode;
  note?: ReactNode;
  footer?: ReactNode;
  /** The footer band tinted (the design's udhaar card), instead of the soft well. */
  footerTone?: "credit";
  /** The design's spectrum bar along the top edge (the first, most important card). */
  accent?: boolean;
  href?: string;
}) {
  const body = (
    <>
      {accent && <div className="n-gradient absolute inset-x-0 top-0 h-1" aria-hidden="true" />}
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className={`n-label pt-0.5 ${labelTone === "credit" ? "text-credit" : labelTone === "danger" ? "text-danger" : "text-muted"}`}>{label}</span>
          {chip}
        </div>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="n-kpi text-foreground" title={valueTitle}>
            {value}
          </span>
          {aside}
        </div>
        {note && <p className="mb-3 text-xs font-medium text-muted">{note}</p>}
      </div>
      {footer && <div className={`flex items-center justify-between gap-2 rounded-lg p-2 ${footerTone === "credit" ? "bg-credit-soft" : "n-well"}`}>{footer}</div>}
    </>
  );
  const cls = "n-card n-kpi-card relative flex flex-col justify-between overflow-hidden p-4";
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:shadow-[var(--elevation-2)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A titled card section: icon tile, title, a line under it, actions on the right. */
export function NSection({ icon: Icon, title, titleAside, subtitle, actions, children, className = "", headClassName = "", bodyClassName = "p-4 md:p-5" }: {
  icon?: LucideIcon;
  title: ReactNode;
  /** A chip right after the title (the design's "Current: 42 bills/hr"). */
  titleAside?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`n-card flex flex-col overflow-hidden ${className}`}>
      <div className={`flex flex-col gap-2 p-4 pb-0 sm:flex-row sm:items-center sm:justify-between md:p-5 md:pb-0 ${headClassName}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Icon size={18} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="n-h2 text-foreground">{title}</h2>
              {titleAside}
            </div>
            {subtitle && <p className="text-xs font-medium text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Dense register table head/cell classes (design: uppercase mono head on a soft band, 12 px rows). */
export const N_TH = "n-label whitespace-nowrap bg-surface-2 px-2.5 py-2.5 text-left font-medium text-muted first:pl-4 last:pr-4";
export const N_TD = "px-2.5 py-2.5 align-middle text-xs first:pl-4 last:pr-4";

export type ChartPoint = { label: string; value: number; count: number; title?: string };

/** "Sales (₹)" as a smooth filled curve over "Bills" as soft bars, the busiest two bars in the
 * strong colour and a marker on the peak — the design's sales velocity chart, as plain SVG (no chart
 * library on the phone). On a phone the bars step back and the curve tells the story. */
export function NSalesChart({ id, points, ariaLabel, emptyText, height = 224 }: { id: string; points: ChartPoint[]; ariaLabel: string; emptyText: string; height?: number }) {
  const W = 800;
  const H = 200;
  const TOP = 14;
  const BASE = 196;
  const n = Math.max(1, points.length);
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const maxC = Math.max(1, ...points.map((p) => p.count));
  const step = W / n;
  const xy = points.map((p, i) => ({ x: step * (i + 0.5), y: BASE - (p.value / maxV) * (BASE - TOP) }));
  const empty = !points.some((p) => p.value > 0);
  const peaks = new Set(
    [...points.keys()]
      .filter((i) => points[i].value > 0)
      .sort((a, b) => points[b].value - points[a].value)
      .slice(0, 2),
  );
  const peak = [...peaks][0];
  const bw = Math.min(26, step * 0.56);

  // Catmull-Rom through the points, as cubic Béziers, kept inside the plot.
  const clampY = (y: number) => Math.min(BASE, Math.max(TOP / 2, y));
  let curve = xy.length ? `M ${xy[0].x.toFixed(1)},${xy[0].y.toFixed(1)}` : "";
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[Math.max(0, i - 1)];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[Math.min(xy.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clampY(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clampY(p2.y - (p3.y - p1.y) / 6) };
    curve += ` C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const area = xy.length ? `${curve} L ${xy[xy.length - 1].x.toFixed(1)},${BASE} L ${xy[0].x.toFixed(1)},${BASE} Z` : "";
  // Long series (a month by day) show every few labels, and always the busiest; a phone, fewer.
  const every = n > 16 ? Math.ceil(n / 10) : 1;
  const phoneEvery = n > 7 ? Math.ceil(n / 5) : 1;

  return (
    <figure className="n-well flex flex-col rounded-xl p-3 md:p-4" aria-label={ariaLabel}>
      <div className="relative w-full" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--n-chart-fill)", stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: "var(--n-chart-fill)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={`${id}-peak`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--n-chart-peak)" }} />
              <stop offset="100%" style={{ stopColor: "var(--n-chart-peak-2)" }} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={TOP + (BASE - TOP) * f} y2={TOP + (BASE - TOP) * f} style={{ stroke: "var(--border)" }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          ))}
          {!empty && (
            <>
              <g className="max-md:opacity-40">
                {points.map((p, i) => {
                  const h = (p.count / maxC) * (BASE - TOP) * 0.9;
                  return h > 0 ? (
                    <rect key={p.label} x={xy[i].x - bw / 2} y={BASE - h} width={bw} height={h} rx="3" style={{ fill: peaks.has(i) ? `url(#${id}-peak)` : "var(--n-chart-bar)" }}>
                      <title>{p.title ?? `${p.label}: ${p.value}`}</title>
                    </rect>
                  ) : null;
                })}
              </g>
              <path d={area} style={{ fill: `url(#${id}-fill)` }} />
              <path d={curve} className="n-chart-line" fill="none" style={{ stroke: "var(--n-chart-line)" }} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {!empty && peak !== undefined && (
          <span
            className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ left: `${(xy[peak].x / W) * 100}%`, top: `${(xy[peak].y / H) * 100}%`, background: "color-mix(in srgb, var(--n-chart-line) 25%, transparent)" }}
            aria-hidden="true"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--n-chart-line)" }} />
          </span>
        )}
        {empty && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-muted">{emptyText}</p>}
      </div>
      <figcaption className="n-tax mt-3 grid text-center text-muted" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {points.map((p, i) => (
          <span key={p.label} className={`truncate ${peaks.has(i) ? (i === peak ? "font-bold text-brand-text" : "font-bold text-secondary") : i % phoneEvery !== 0 ? "max-md:invisible" : ""}`}>
            {i % every === 0 || peaks.has(i) ? p.label : ""}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** A square quick-launch tile (design: "Fast counter keys"), with its key when it has one. */
export function NTile({ href, icon: Icon, title, sub, strong, kbd }: { href: string; icon: LucideIcon; title: string; sub?: string; strong?: boolean; kbd?: string }) {
  return (
    <Link
      href={href}
      className={`flex min-h-[104px] flex-col justify-between gap-2 rounded-xl p-3 transition-transform hover:-translate-y-0.5 ${strong ? "n-gradient shadow-md" : "bg-surface-2 text-foreground hover:bg-brand-soft"}`}
    >
      <span className="flex items-center justify-between">
        <Icon size={22} strokeWidth={2} className={strong ? "text-white" : "text-brand-text"} aria-hidden="true" />
        {kbd && <kbd className={`n-tax hidden rounded px-1.5 py-0.5 font-bold md:inline ${strong ? "bg-white/20 text-white" : "bg-surface text-muted"}`}>{kbd}</kbd>}
      </span>
      <span>
        <span className="block text-sm font-bold leading-tight">{title}</span>
        {sub && <span className={`n-tax block text-[10px] ${strong ? "text-white/80" : "text-muted"}`}>{sub}</span>}
      </span>
    </Link>
  );
}

const ALERT: Record<Tone, string> = {
  credit: "bg-credit-soft",
  danger: "bg-danger-soft",
  warning: "bg-warning-soft",
  brand: "bg-brand-soft",
  secondary: "bg-secondary-soft",
  success: "bg-success-soft",
  neutral: "bg-surface-2",
};
const ALERT_ICON: Record<Tone, string> = {
  credit: "text-credit",
  danger: "text-danger",
  warning: "text-warning",
  brand: "text-brand-text",
  secondary: "text-secondary",
  success: "text-success",
  neutral: "text-muted",
};

/** One of the design's alert cards: a tinted block with an icon, what needs doing, and its buttons. */
export function NAlertCard({ tone, icon: Icon, title, sub, children }: { tone: Tone; icon: LucideIcon; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 rounded-lg p-3 ${ALERT[tone]}`}>
      <div className="flex items-start gap-2">
        <Icon size={18} className={`mt-0.5 shrink-0 ${ALERT_ICON[tone]}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-foreground">{title}</div>
          {sub && <div className="n-tax text-muted">{sub}</div>}
        </div>
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}
