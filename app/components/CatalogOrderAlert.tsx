"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { listPendingCatalogOrdersAction, rejectCatalogOrderAction } from "@/lib/actions/catalog";
import { formatMoney } from "@/lib/format";

type PendingOrder = { id: string; customerName: string; total: number; createdAt: string };

export function CatalogOrderAlert() {
  const router = useRouter();
  const pathname = usePathname();
  const [alerting, setAlerting] = useState<PendingOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unlock audio on first touch — a shop's dashboard may sit open on a
  // counter tablet with nobody having tapped it recently.
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
    unlock();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  function playChime() {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const ring = (freq: number, startAt: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.8, ctx.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.25);
        oscillator.start(ctx.currentTime + startAt);
        oscillator.stop(ctx.currentTime + startAt + 0.25);
      };
      // "Zoom-tig-tig" — three quick ascending notes, deliberately more
      // urgent than the kitchen/waiter chimes, since a missed online
      // order directly costs a sale.
      ring(587, 0);
      ring(740, 0.14);
      ring(880, 0.28);
    } catch {
      // Audio isn't critical — fail silently if the browser blocks it.
    }
  }

  // Poll for pending orders; detect newly-arrived ones to alert on.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const pending = await listPendingCatalogOrdersAction();
      if (cancelled) return;
      const currentIds = new Set(pending.map((o) => o.id));

      if (seenIds.current === null) {
        // First load — don't alert on orders that were already sitting
        // there before this page opened, only genuinely new arrivals.
        seenIds.current = currentIds;
        return;
      }

      const newOnes = pending.filter((o) => !seenIds.current!.has(o.id));
      setAlerting((prev) => {
        const merged = newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        // Stop alerting on any order that's no longer pending (handled
        // from elsewhere, e.g. the Catalog Orders page directly).
        return merged.filter((o) => currentIds.has(o.id));
      });
      seenIds.current = currentIds;
    }
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Keep ringing on a loop for as long as there's an unhandled alert —
  // deliberately naggy (matches how delivery-partner apps behave), not
  // a single ding a person can easily miss.
  useEffect(() => {
    if (alerting.length > 0 && !ringIntervalRef.current) {
      playChime();
      ringIntervalRef.current = setInterval(playChime, 3500);
    }
    if (alerting.length === 0 && ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, [alerting.length]);

  useEffect(() => {
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    };
  }, []);

  function quickReject(id: string) {
    setBusyId(id);
    rejectCatalogOrderAction(id).finally(() => {
      setBusyId(null);
      setAlerting((prev) => prev.filter((o) => o.id !== id));
      router.refresh();
    });
  }

  if (alerting.length === 0) return null;
  if (pathname === "/catalog-orders") return null;
  const current = alerting[0];

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-4">
      <div className="ray-pop w-full max-w-sm rounded-2xl bg-surface p-5" style={{ boxShadow: "var(--elevation-4)" }}>
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 shrink-0 animate-pulse rounded-full bg-danger" />
          <p className="text-xs font-semibold uppercase tracking-wide text-danger">New online order</p>
        </div>
        <p className="mt-2 text-lg font-semibold text-foreground">{current.customerName}</p>
        <p className="text-2xl font-bold text-foreground neu-text">{formatMoney(current.total)}</p>
        {alerting.length > 1 && (
          <p className="mt-1 text-xs text-muted">+{alerting.length - 1} more waiting</p>
        )}
        <p className="mt-2 text-xs text-muted">
          Keeps ringing until this is accepted or rejected — tap below to review it.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => router.push("/catalog-orders")}
            className="btn-primary w-full text-center"
          >
            Review &amp; accept
          </button>
          <button
            onClick={() => quickReject(current.id)}
            disabled={busyId === current.id}
            className="w-full rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
          >
            {busyId === current.id ? "Working…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
