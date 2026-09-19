import { Inbox } from "lucide-react";

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
        <Inbox size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <p className="max-w-[260px] text-sm leading-relaxed text-muted">{text}</p>
      {action}
    </div>
  );
}
