/** Genuinely instant — Next.js renders this the MOMENT a navigation
 * starts, with zero data-fetching of its own, so a tap always gets
 * immediate visual feedback even before the destination page's
 * Server Component has fetched anything. Without a loading.tsx file,
 * Next.js shows nothing at all until the whole next page is fully
 * ready — which is what makes a tap feel like it didn't register on
 * a slower connection or a heavier page. */
export function PageLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="h-6 w-40 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-surface-2" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-surface-2" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
