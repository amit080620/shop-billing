export default function Loading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2">
        <div className="h-16 w-16 animate-pulse rounded-full bg-border" />
        <div className="h-4 w-40 animate-pulse rounded-md bg-border" />
        <div className="h-3 w-28 animate-pulse rounded-md bg-border" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-14 shrink-0 animate-pulse rounded-xl bg-border" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-border" />
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-3">
        <div className="h-11 animate-pulse rounded-lg bg-border" />
        <div className="h-11 animate-pulse rounded-lg bg-border" />
        <div className="h-11 animate-pulse rounded-lg bg-border" />
      </div>
    </div>
  );
}
