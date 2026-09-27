"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

export function BillCreatedConfirmation({ amount, pointsEarned }: { amount?: string; pointsEarned?: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [visible, setVisible] = useState(searchParams.get("new") === "1");

  useEffect(() => {
    if (!visible) return;
    // Auto-dismiss, then strip the ?new=1 flag so refreshing/sharing this link never
    // re-triggers the celebration. Done via the native History API, not router.replace:
    // that would re-navigate this server-rendered page, flashing the already-rendered
    // invoice back to the loading skeleton while it refetches from scratch.
    const timer = setTimeout(() => {
      setVisible(false);
      window.history.replaceState(null, "", pathname);
    }, 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="no-print fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setVisible(false)}>
      <div className="surface-raised ray-pop flex flex-col items-center gap-3 px-9 py-8">
        <div
          className="ray-success flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--ray-gradient)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 6 9 17l-5-5"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="bill-checkmark"
              pathLength={1}
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">Bill created</p>
          {amount && <p className="mt-0.5 text-sm text-muted">{amount}</p>}
          {!!pointsEarned && pointsEarned > 0 && (
            <p className="mt-1 text-xs font-medium text-brand-text">🎁 +{pointsEarned} loyalty points earned</p>
          )}
        </div>
      </div>
    </div>
  );
}

