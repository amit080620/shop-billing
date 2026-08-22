export default function Loading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded-md bg-border" />
          <div className="h-3 w-24 animate-pulse rounded-md bg-border" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-square animate-pulse rounded-xl bg-border" />
            <div className="h-3 w-3/4 animate-pulse rounded-md bg-border" />
            <div className="h-3 w-1/2 animate-pulse rounded-md bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}
