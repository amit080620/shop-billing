export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
          <path d="M3.5 8v8L12 20l8.5-4V8" />
        </svg>
      </span>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
