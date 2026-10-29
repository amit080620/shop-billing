"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NewBillClient } from "./NewBillClient";
import { FastBillingBanner } from "./FastBillingBanner";
import { PageLoadingSkeleton } from "@/app/components/PageLoadingSkeleton";
import { readScreen, saveScreen } from "@/lib/screenCache";
import type { NewBillScreen } from "@/lib/billing/newBillScreen";

/** New Bill, opened at once from the copy kept on this phone (lib/screenCache) while a fresh copy
 * loads from the server; the fresh one then takes its place without disturbing the bill being made
 * (same screen, newer products, prices, stock and customers). The first time — or after an app
 * update — it waits for the server, as before. The server checks every price and stock again when
 * the bill is saved, so a copy a few seconds old can never save a wrong bill. */
export function CachedNewBill({ cacheKey }: { cacheKey: string }) {
  const router = useRouter();
  const [screen, setScreen] = useState<NewBillScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const fresh = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/screens/new-bill", { cache: "no-store" });
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { screen: NewBillScreen };
      fresh.current = true;
      setScreen(body.screen);
      void saveScreen(cacheKey, body.screen);
    } catch {
      // Keep showing the kept copy, if there is one; otherwise offer to try again.
      setFailed(true);
    }
  }, [cacheKey, router]);

  useEffect(() => {
    let alive = true;
    void readScreen<NewBillScreen>(cacheKey).then((kept) => {
      if (alive && kept && !fresh.current) setScreen(kept.data);
    });
    void load();
    return () => {
      alive = false;
    };
  }, [cacheKey, load]);

  if (!screen) {
    if (failed) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted">Couldn&apos;t load billing — check the internet connection.</p>
          <button onClick={() => void load()} className="btn-primary-sm">
            Try again
          </button>
        </div>
      );
    }
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-3">
      {screen.fastBillingEnabled && <FastBillingBanner />}
      <NewBillClient {...screen.props} />
    </div>
  );
}
