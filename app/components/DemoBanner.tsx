import Link from "next/link";
import { FlaskConical } from "lucide-react";

/** Shown at the top of every screen of a demo shop (see lib/demo). */
export function DemoBanner() {
  return (
    <div className="no-print mb-3 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-text">
      <FlaskConical size={14} className="shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Demo shop.</span> Sample data, refreshed every night. Nothing here is real.
      </p>
      <Link href="/demo" className="shrink-0 rounded-full bg-surface px-2.5 py-1 font-semibold text-brand-text">
        All demos
      </Link>
    </div>
  );
}
