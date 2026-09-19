import { Inbox, type LucideIcon } from "lucide-react";

/** Friendly "nothing here yet" panel: a small illustration, an optional
 * title, one line of guidance and, where it helps, the first step as a
 * button. */
export function EmptyState({
  text,
  title,
  icon: Icon = Inbox,
  action,
}: {
  text: string;
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <div className="relative mb-1 h-20 w-20" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-brand-soft" />
        <span className="absolute inset-[10px] rounded-full border border-border bg-surface" style={{ boxShadow: "var(--elev-sm)" }} />
        <span className="absolute inset-0 flex items-center justify-center text-brand-text">
          <Icon size={28} strokeWidth={1.6} />
        </span>
        <span className="absolute right-1 top-2 h-2.5 w-2.5 rounded-full" style={{ background: "var(--ray-gradient, var(--brand))" }} />
        <span className="absolute bottom-3 left-0 h-1.5 w-1.5 rounded-full bg-brand/40" />
      </div>
      {title && <p className="text-base font-semibold text-foreground">{title}</p>}
      <p className="max-w-[280px] text-sm leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
