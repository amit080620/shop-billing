"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markItemReadyAction, acknowledgeRevisionAction } from "@/lib/actions/restaurant";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { TVNavigationProvider, TVRemoteHandler, TVFocusZone, TVFocusable } from "@/lib/tv-nav";
import { AlertTriangle, X, Check } from "lucide-react";
import type { Lang } from "@/lib/i18n/dictionary";

type Item = { id: string; name: string; quantity: number; status: "pending" | "ready" | "served" | "cancelled"; createdAt: string; modifiers: { group: string; choice: string; price: number }[] };
type Ticket = {
  id: string;
  orderNumber: string;
  tableName: string;
  createdAt: string;
  revisedAt: string | null;
  items: Item[];
};

export function KdsClient({
  shopName,
  initialTickets,
  lang,
  columns = 3,
  fontScale = "normal",
}: {
  shopName: string;
  initialTickets: Ticket[];
  lang: Lang;
  columns?: number;
  fontScale?: "normal" | "large" | "extra_large";
}) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  const [, startTransition] = useTransition();
  const [localOverrides, setLocalOverrides] = useState<Partial<Record<string, "pending" | "ready">>>({});
  const [showCursor, setShowCursor] = useState(false);
  const seenItemIds = useRef<Set<string> | null>(null);
  const seenRevisedIds = useRef<Set<string>>(new Set());

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Mobile/tablet browsers block audio from actually playing until the
  // page has been touched at least once — a KDS tablet often just sits
  // there with orders arriving via polling, with nobody tapping it, so
  // every fresh AudioContext silently fails to produce sound. Unlocking
  // once on the first touch/click anywhere, and reusing that same
  // context afterward, is what actually fixes "sound nahi aa raha".
  useEffect(() => {
    function unlock() {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
    unlock();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Beep whenever a poll brings in an item this screen hasn't seen before
  // (a genuinely new order/item, not just a status change) — so kitchen
  // staff notice a new ticket without having to stare at the screen.
  // A distinct double-beep fires for a REVISED ticket (item cancelled
  // after being sent to kitchen) — deliberately different so staff can
  // tell "new food" from "stop, something changed" by ear alone.
  useEffect(() => {
    const currentIds = new Set(initialTickets.flatMap((tk) => tk.items.map((i) => i.id)));
    const currentlyRevised = new Set(initialTickets.filter((tk) => tk.revisedAt).map((tk) => tk.id));

    if (seenItemIds.current === null) {
      seenItemIds.current = currentIds;
      seenRevisedIds.current = currentlyRevised;
      return;
    }
    const hasNewItem = [...currentIds].some((id) => !seenItemIds.current!.has(id));
    const hasNewRevision = [...currentlyRevised].some((id) => !seenRevisedIds.current.has(id));
    if (hasNewRevision) playBeep(true);
    else if (hasNewItem) playBeep(false);
    seenItemIds.current = currentIds;
    seenRevisedIds.current = currentlyRevised;
  }, [initialTickets]);

  function playBeep(urgent: boolean) {
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
        gain.gain.setValueAtTime(0.45, ctx.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.4);
        oscillator.start(ctx.currentTime + startAt);
        oscillator.stop(ctx.currentTime + startAt + 0.4);
      };
      if (urgent) {
        // Two sharp, slightly lower tones — "something changed", not
        // "new food's coming".
        ring(660, 0);
        ring(660, 0.22);
      } else {
        ring(880, 0);
      }
    } catch {
      // Audio isn't critical — fail silently if the browser blocks it.
    }
  }

  // Auto-refresh: pulls fresh data from the server every 8s.
  useEffect(() => {
    const dataTimer = setInterval(() => router.refresh(), 8000);
    const clockTimer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [router]);

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

  function toggleReady(itemId: string, current: "pending" | "ready" | "served" | "cancelled") {
    if (current === "served" || current === "cancelled") return;
    const next = current === "ready" ? "pending" : "ready";
    setLocalOverrides((prev) => ({ ...prev, [itemId]: next }));
    startTransition(async () => {
      await markItemReadyAction(itemId);
    });
  }

  function bumpTicket(ticket: Ticket) {
    for (const item of ticket.items) {
      if (item.status === "pending") toggleReady(item.id, "pending");
    }
  }

  function acknowledge(orderId: string) {
    startTransition(async () => {
      await acknowledgeRevisionAction(orderId);
      router.refresh();
    });
  }

  // Kitchen's job ends once every item is ready — serving the table is
  // the waiter's separate step, tracked elsewhere. Waiting for "served"
  // here meant a ticket marked ready on the KDS just sat there.
  const visibleTickets = initialTickets.filter((tk) => tk.items.some((i) => i.status === "pending") || tk.revisedAt);

  // Any keyboard/remote input hides the system cursor immediately — the
  // actual navigation (arrow keys/Enter) is handled by TVRemoteHandler
  // below; this listener only tracks "something on the keyboard/remote
  // was pressed" so the (often-unwanted, TV-inappropriate) mouse
  // pointer graphic disappears the moment real input starts.
  useEffect(() => {
    function onKeyDown() {
      setShowCursor(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A real mouse moving is the only thing allowed to show the system
  // cursor — any keyboard/remote input hides it again immediately.
  useEffect(() => {
    function onMouseMove() {
      setShowCursor(true);
    }
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  const sizes =
    fontScale === "extra_large"
      ? { table: "text-2xl", order: "text-sm", item: "text-lg", qty: "text-2xl" }
      : fontScale === "large"
        ? { table: "text-xl", order: "text-xs", item: "text-base", qty: "text-xl" }
        : { table: "text-base", order: "text-[10px]", item: "text-sm", qty: "text-base" };

  return (
    <TVNavigationProvider>
      <TVRemoteHandler onBack={() => router.push("/restaurant")} />
      <div className={`min-h-screen bg-gray-950 p-3 text-white ${showCursor ? "" : "cursor-none"}`}>
      <div className="mb-3 flex items-center gap-3">
        <a
          href="/restaurant"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 md:px-4 md:py-2.5 md:text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="md:h-[18px] md:w-[18px]">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t("kds.backToApp")}
        </a>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold md:text-xl">{t("kds.title", { shop: shopName })}</h1>
          <p className="text-xs text-gray-400 md:text-sm">{t("kds.subtitle", { count: visibleTickets.length })}</p>
        </div>
      </div>

      {visibleTickets.length === 0 ? (
        <div className="flex h-[70vh] items-center justify-center text-2xl font-medium text-gray-600">
          {t("kds.empty")}
        </div>
      ) : (
        <TVFocusZone id="kds-tickets">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {visibleTickets.map((ticket, index) => {
              const age = Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000);
              const isRevised = !!ticket.revisedAt;
              const tone = isRevised
                ? "border-red-500 bg-red-950/50 animate-pulse"
                : age >= 20
                  ? "border-red-500 bg-red-950/40"
                  : age >= 10
                    ? "border-amber-500 bg-amber-950/30"
                    : "border-emerald-600 bg-emerald-950/20";
              return (
                <TVFocusable
                  key={ticket.id}
                  id={ticket.id}
                  autoFocus={index === 0}
                  onSelect={() => (isRevised ? acknowledge(ticket.id) : bumpTicket(ticket))}
                  clickable={false}
                  className={`flex flex-col gap-1.5 rounded-xl border-2 p-2.5 text-sm outline-none ${tone}`}
                  focusClassName="ring-4 ring-white ring-offset-2 ring-offset-gray-950"
                >
                {isRevised && (
                  <button
                    onClick={() => acknowledge(ticket.id)}
                    className="mb-0.5 flex items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-center text-xs font-bold text-white"
                  >
                    <AlertTriangle size={12} /> ORDER REVISED — tap to clear
                  </button>
                )}
                <div className="flex items-center justify-between">
                  <p className={`${sizes.table} font-bold`}>{ticket.tableName}</p>
                  <span className="text-xs font-semibold text-gray-300">{age}m</span>
                </div>
                <p className={`${sizes.order} text-gray-400`}>#{ticket.orderNumber}</p>
                <ul className="mt-0.5 flex flex-col gap-1">
                  {ticket.items.map((item) => {
                    const effectiveStatus = localOverrides[item.id] ?? item.status;
                    const isReady = effectiveStatus === "ready";
                    const isCancelled = effectiveStatus === "cancelled";
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => toggleReady(item.id, effectiveStatus)}
                          disabled={isCancelled}
                          className={`flex w-full items-baseline justify-between rounded-lg px-2 py-1 text-left ${sizes.item} ${
                            isCancelled
                              ? "bg-red-900/40 text-red-300 line-through"
                              : isReady
                                ? "bg-white/10 line-through opacity-60"
                                : "bg-black/20"
                          }`}
                        >
                          <span className="flex flex-col">
                            <span className="flex items-center gap-1 font-medium">
                              {isCancelled ? <X size={12} /> : isReady ? <Check size={12} /> : null}
                              {item.name}
                            </span>
                            {item.modifiers.length > 0 && (
                              <span className="text-[11px] font-normal text-gray-400">
                                {item.modifiers.map((m) => m.choice).join(", ")}
                              </span>
                            )}
                          </span>
                          <span className={`ml-2 shrink-0 ${sizes.qty} font-bold`}>×{item.quantity}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </TVFocusable>
              );
            })}
          </div>
        </TVFocusZone>
      )}
      </div>
    </TVNavigationProvider>
  );
}
