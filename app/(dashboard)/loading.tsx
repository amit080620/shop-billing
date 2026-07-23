export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <div className="h-5 w-40 animate-pulse rounded-md bg-border" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded-md bg-border" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
