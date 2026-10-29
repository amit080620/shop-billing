"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FastBillingClient } from "./FastBillingClient";
import { PageLoadingSkeleton } from "@/app/components/PageLoadingSkeleton";
import { readScreen, saveScreen } from "@/lib/screenCache";
import type { FastBillingProps, FastBillingScreen } from "@/lib/billing/fastBillingScreen";

/** Fast Billing, opened at once from the copy kept on this phone (lib/screenCache) while a fresh
 * copy loads; the fresh one takes its place without disturbing the bill being made. The server
 * prices every line from the catalogue again when the bill is saved. */
export function CachedFastBilling({ cacheKey }: { cacheKey: string }) {
  const router = useRouter();
  const [props, setProps] = useState<FastBillingProps | null>(null);
  const [failed, setFailed] = useState(false);
  const fresh = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/screens/fast-billing", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { screen: FastBillingScreen };
      fresh.current = true;
      if (!body.screen.props) {
        // Fast Billing isn't switched on for this shop: its settings page says how.
        router.replace("/fast-billing-settings");
        return;
      }
      setProps(body.screen.props);
      void saveScreen(cacheKey, body.screen.props);
    } catch {
      setFailed(true);
    }
  }, [cacheKey, router]);

  useEffect(() => {
    let alive = true;
    void readScreen<FastBillingProps>(cacheKey).then((kept) => {
      if (alive && kept && !fresh.current) setProps(kept.data);
    });
    void load();
    return () => {
      alive = false;
    };
  }, [cacheKey, load]);

  if (!props) {
    if (failed) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted">Couldn&apos;t load Fast Billing — check the internet connection.</p>
          <button onClick={() => void load()} className="btn-primary-sm">
            Try again
          </button>
        </div>
      );
    }
    return <PageLoadingSkeleton />;
  }
  return <FastBillingClient {...props} />;
}
