/** The keys a billing screen answers to, shown on a computer with keyboard billing on. */
export function KeyboardHint({ keys }: { keys: [string, string][] }) {
  return (
    <p className="no-print hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted md:flex">
      {keys.map(([key, what]) => (
        <span key={key}>
          <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-foreground">{key}</kbd> {what}
        </span>
      ))}
    </p>
  );
}
