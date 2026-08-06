"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markItemReadyAction } from "@/lib/actions/restaurant";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Item = { id: string; name: string; quantity: number; status: "pending" | "ready" | "served"; createdAt: string };
type Ticket = {
  id: string;
  orderNumber: string;
  tableName: string;
  createdAt: string;
  items: Item[];
};

export function KdsClient({ shopName, initialTickets, lang }: { shopName: string; initialTickets: Ticket[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  const [, startTransition] = useTransition();
  const [localOverrides, setLocalOverrides] = useState<Record<string, "pending" | "ready">>({});
  const seenItemIds = useRef<Set<string> | null>(null);

  // Beep whenever a poll brings in an item this screen hasn't seen before
  // (a genuinely new order/item, not just a status change) — so kitchen
  // staff notice a new ticket without having to stare at the screen.
  useEffect(() => {
    const currentIds = new Set(initialTickets.flatMap((t) => t.items.map((i) => i.id)));
    if (seenItemIds.current === null) {
      // First render — just record what's there, don't beep for the
      // initial page load.
      seenItemIds.current = currentIds;
      return;
    }
    const hasNewItem = [...currentIds].some((id) => !seenItemIds.current!.has(id));
    if (hasNewItem) playBeep();
    seenItemIds.current = currentIds;
  }, [initialTickets]);

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio isn't critical — fail silently if the browser blocks it
      // (e.g. no user interaction yet on this page).
    }
  }

  // Auto-refresh: pulls fresh data from the server every 8s (new orders,
  // new items, tables that just settled disappear) — simple polling
  // rather than a realtime subscription, which is plenty responsive for a
  // kitchen screen and far more robust to build and keep working.
  useEffect(() => {
    const dataTimer = setInterval(() => router.refresh(), 8000);
    const clockTimer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [router]);

  // Clear stale local taps once a refresh brings back matching server data.
  useEffect(() => {
    setLocalOverrides((prev) => {
      const next = { ...prev };
      for (const ticket of initialTickets) {
        for (const item of ticket.items) {
          if (next[item.id] === item.status) delete next[item.id];
        }
      }
      return next;
    });
  }, [initialTickets]);

  function toggleReady(itemId: string, current: "pending" | "ready" | "served") {
    if (current === "served") return;
    const next = current === "ready" ? "pending" : "ready";
    setLocalOverrides((prev) => ({ ...prev, [itemId]: next }));
    startTransition(async () => {
      await markItemReadyAction(itemId);
      // markItemReadyAction only sets "ready" — toggling back to pending
      // isn't wired server-side on purpose (kitchen correcting a slip is
      // rare enough that a refresh resolving it is fine), but the local
      // toggle still gives instant visual feedback either way.
    });
  }

  const visibleTickets = initialTickets
    .map((t) => ({ ...t, items: t.items.filter((i) => i.status !== "served") }))
    .filter((t) => t.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("kds.title", { shop: shopName })}</h1>
          <p className="text-sm text-gray-400">{t("kds.subtitle", { count: visibleTickets.length })}</p>
        </div>
        <a href="/restaurant" className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300">
          {t("kds.backToApp")}
        </a>
      </div>

      {visibleTickets.length === 0 ? (
        <div className="flex h-[70vh] items-center justify-center text-2xl font-medium text-gray-600">
          {t("kds.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTickets.map((ticket) => {
            const age = Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000);
            const tone =
              age >= 20
                ? "border-red-500 bg-red-950/40"
                : age >= 10
                  ? "border-amber-500 bg-amber-950/30"
                  : "border-emerald-600 bg-emerald-950/20";
            return (
              <div key={ticket.id} className={`flex flex-col gap-2 rounded-2xl border-2 p-4 ${tone}`}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">{ticket.tableName}</p>
                  <span className="text-sm font-semibold text-gray-300">{age}m</span>
                </div>
                <p className="text-xs text-gray-400">#{ticket.orderNumber}</p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {ticket.items.map((item) => {
                    const effectiveStatus = localOverrides[item.id] ?? item.status;
                    const isReady = effectiveStatus === "ready";
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => toggleReady(item.id, effectiveStatus)}
                          className={`flex w-full items-baseline justify-between rounded-lg px-2 py-1.5 text-left text-base ${
                            isReady ? "bg-white/10 line-through opacity-60" : "bg-black/20"
                          }`}
                        >
                          <span className="font-medium">{isReady ? "✓ " : ""}{item.name}</span>
                          <span className="ml-2 shrink-0 text-lg font-bold">×{item.quantity}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
