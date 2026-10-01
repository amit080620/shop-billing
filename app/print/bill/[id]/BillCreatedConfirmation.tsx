"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

/** "Bill created" as a small bar at the top that never covers the invoice — Print and WhatsApp can
 * be tapped straight away. (It used to be a full-screen card held for 2.2 seconds, which on a slow
 * phone felt like the app was stuck after every bill.) */
export function BillCreatedConfirmation({ amount, pointsEarned }: { amount?: string; pointsEarned?: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [visible, setVisible] = useState(searchParams.get("new") === "1");

  useEffect(() => {
    if (!visible) return;
    // Strip ?new=1 at once with the History API (not router.replace, which would re-render the
    // whole page) so a refresh or a shared link never shows this again; hide the bar shortly after.
    window.history.replaceState(null, "", pathname);
    const timer = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-4">
      <div className="ray-pop flex items-center gap-2.5 rounded-full px-4 py-2 text-white shadow-lg" style={{ background: "var(--ray-gradient)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="bill-checkmark" pathLength={1} />
        </svg>
        <p className="text-sm font-semibold">
          Bill created{amount ? ` · ${amount}` : ""}
          {!!pointsEarned && pointsEarned > 0 && <span className="ml-1.5 text-xs font-medium opacity-90">🎁 +{pointsEarned} points</span>}
        </p>
      </div>
    </div>
  );
}
