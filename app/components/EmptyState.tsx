export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-brand-dark shadow-sm"
        style={{ background: "var(--brand-soft)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
          <path d="M3.5 8v8L12 20l8.5-4V8" />
        </svg>
      </span>
      <p className="max-w-[220px] text-sm text-muted">{text}</p>
    </div>
  );
}
