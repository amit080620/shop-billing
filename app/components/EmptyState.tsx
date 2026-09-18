export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
          <path d="M3.5 8v8L12 20l8.5-4V8" />
        </svg>
      </span>
      <p className="max-w-[260px] text-sm leading-relaxed text-muted">{text}</p>
      {action}
    </div>
  );
}
