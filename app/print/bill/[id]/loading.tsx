export default function Loading() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-6">
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 w-40 animate-pulse rounded-md bg-border" />
        <div className="h-3 w-24 animate-pulse rounded-md bg-border" />
      </div>
      <div className="mt-2 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-3">
            <div className="h-3 w-28 animate-pulse rounded-md bg-border" />
            <div className="h-3 w-14 animate-pulse rounded-md bg-border" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-px animate-pulse bg-border" />
      <div className="flex justify-between gap-3">
        <div className="h-4 w-16 animate-pulse rounded-md bg-border" />
        <div className="h-4 w-20 animate-pulse rounded-md bg-border" />
      </div>
    </div>
  );
}
