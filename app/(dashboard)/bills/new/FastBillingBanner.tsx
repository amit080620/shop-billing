import Link from "@/lib/link";

/** "Fast Billing →" above New Bill, for a shop that has it switched on. */
export function FastBillingBanner() {
  return (
    <Link href="/fast-billing" className="flex items-center gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white">⚡</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-text">Fast Billing</p>
        <p className="text-xs text-muted">Skip the full form — tap items, get paid</p>
      </div>
      <span className="text-brand-text">→</span>
    </Link>
  );
}
