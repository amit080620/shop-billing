"use client";

import { useEffect, useState } from "react";
import Link from "@/lib/link";
import { WifiOff } from "lucide-react";

/** Bills made with no internet go up by themselves as soon as the app is open with a connection —
 * on any screen, not only the offline billing page. One the server refused shows a note here. */
export function OfflineBillsSync({ shopId }: { shopId: string }) {
  const [needsAttention, setNeedsAttention] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check(sync: boolean) {
      try {
        const { getPendingBills } = await import("@/lib/offline-db");
        const { belongsTo, syncPendingBills } = await import("@/lib/offlineSync");
        const mine = (await getPendingBills()).filter((b) => belongsTo(b, shopId));
        if (sync && navigator.onLine && mine.some((b) => b.status !== "failed")) await syncPendingBills(shopId);
        const after = (await getPendingBills()).filter((b) => belongsTo(b, shopId));
        if (!cancelled) setNeedsAttention(after.filter((b) => b.status === "failed").length);
      } catch {
        // No storage on this phone: nothing was ever queued here.
      }
    }
    // A moment after the screen is up, so it never competes with what the person opened.
    const timer = setTimeout(() => void check(true), 2500);
    const onOnline = () => void check(true);
    // A sync finished (here or on the offline page): just recount — syncing again from here would
    // loop while the server can't be reached.
    const onChange = () => void check(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("ray:offline-bills", onChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("ray:offline-bills", onChange);
    };
  }, [shopId]);

  if (!needsAttention) return null;
  return (
    <Link href="/offline-bill" className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-credit bg-credit-soft px-3 py-2 text-xs font-medium text-credit">
      <WifiOff size={14} />
      {needsAttention} offline bill{needsAttention === 1 ? "" : "s"} couldn&apos;t sync — tap to fix
    </Link>
  );
}
