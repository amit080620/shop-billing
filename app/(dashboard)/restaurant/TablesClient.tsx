"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTableAction, createNumberedTablesAction, startOrderAction, renameTableAction, deleteTableAction, clearEmptyOrderAction } from "@/lib/actions/restaurant";
import { lookupCustomerByPhoneAction } from "@/lib/actions/customers";
import {
  listPendingTableRequestsAction,
  acceptTableOrderRequestAction,
  rejectTableOrderRequestAction,
  getTableQrImageAction,
} from "@/lib/actions/table-orders";
import { LayoutGrid, Layers, CalendarClock, Smartphone, Check, X, Bell, QrCode, Minus, Plus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { useToast } from "@/app/components/Toast";
import { EmptyState } from "@/app/components/EmptyState";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { BackLink } from "@/app/components/BackLink";

type Table = {
  id: string;
  name: string;
  status: "free" | "occupied";
  section: "inside" | "outside" | "takeaway" | null;
  /** A hotel room's room-service table. */
  isRoom?: boolean;
  openOrderId: string | null;
  openOrderTotal: number;
  readyCount: number;
  qrToken: string;
  reservation: { customerName: string; time: string; partySize: number } | null;
};
type PendingRequest = { id: string; tableId: string; tableName: string; customerName: string | null; createdAt: string; items: { name: string; quantity: number }[] };

const SECTION_LABEL: Record<"inside" | "outside" | "takeaway", string> = {
  inside: "Inside",
  outside: "Outside",
  takeaway: "Takeaway",
};
// Tile colours are readable from across the room: green free, amber
// reserved, red occupied.
const TILE_TONE = {
  free: { tile: "border-success/30 bg-surface", dot: "bg-success", text: "text-success" },
  reserved: { tile: "border-warning/35 bg-warning-soft", dot: "bg-warning", text: "text-warning" },
  occupied: { tile: "border-danger/35 bg-danger-soft", dot: "bg-danger", text: "text-danger" },
};

function TableTile({
  table,
  dimmed,
  freeLabel,
  t,
  onOpen,
  onQr,
  onClearEmpty,
}: {
  table: Table;
  dimmed: boolean;
  freeLabel: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onOpen: () => void;
  onQr: () => void;
  onClearEmpty: (e: React.MouseEvent) => void;
}) {
  const state = table.status === "occupied" ? "occupied" : table.reservation ? "reserved" : "free";
  const tone = TILE_TONE[state];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className={`relative flex min-h-24 flex-col justify-between gap-2 rounded-xl border p-3 transition-colors hover:border-border-strong active:scale-[0.98] md:min-h-28 md:p-4 ${tone.tile} ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-foreground md:text-lg">{table.name}</p>
          <p className="text-[11px] text-muted">{table.isRoom ? t("Room service") : t(SECTION_LABEL[table.section ?? "inside"])}</p>
        </div>
        {/* A room's table is managed from the hotel set-up, not from here. */}
        {!table.isRoom && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onQr();
          }}
          aria-label={t("QR code and settings for {name}", { name: table.name })}
          className="-mr-2 -mt-2 shrink-0 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <QrCode size={16} />
        </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {table.readyCount > 0 && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
            <Bell size={10} /> {t("{n} ready", { n: table.readyCount })}
          </span>
        )}
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${tone.text}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
          {state === "occupied" ? (
            table.openOrderTotal === 0 ? (
              <button onClick={onClearEmpty} className="flex items-center gap-1 underline decoration-dotted">
                <X size={11} /> {t("Empty — clear")}
              </button>
            ) : (
              formatMoney(table.openOrderTotal)
            )
          ) : state === "reserved" && table.reservation ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <CalendarClock size={11} className="shrink-0" /> {table.reservation.time}
            </span>
          ) : (
            freeLabel
          )}
        </span>
      </div>
    </div>
  );
}

export function TablesClient({ tables, lang }: { tables: Table[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSection, setNewTableSection] = useState<"inside" | "outside" | "takeaway">("inside");
  const [bulkCount, setBulkCount] = useState(tables.length === 0 ? 10 : 5);
  const [sectionFilter, setSectionFilter] = useState<"all" | "inside" | "outside" | "takeaway" | "rooms">(
    // A hotel with no dining tables of its own starts on its rooms, not an empty grid.
    tables.length > 0 && tables.every((x) => x.isRoom) ? "rooms" : "all",
  );
  // Room tables have their own tab; on the main view only a room with a live
  // order shows, so room service is never missed.
  const visibleTables = tables.filter((table) => {
    if (sectionFilter === "rooms") return !!table.isRoom;
    if (table.isRoom) return sectionFilter === "all" && !!table.openOrderId;
    return sectionFilter === "all" || (table.section ?? "inside") === sectionFilter;
  });
  const [error, setError] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tableActionError, setTableActionError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const seenReadyTableIds = useRef<Set<string> | null>(null);
  const readyAudioCtxRef = useRef<AudioContext | null>(null);
  const { showToast } = useToast();

  // Unlock audio on first touch — same fix as the kitchen display;
  // without this, a waiter's phone/tablet left sitting on the tables
  // screen would silently never play the ready chime at all.
  useEffect(() => {
    function unlock() {
      if (!readyAudioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        readyAudioCtxRef.current = new Ctx();
      }
      if (readyAudioCtxRef.current.state === "suspended") readyAudioCtxRef.current.resume();
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchstart", unlock);
    unlock();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Waiter-side "order ready" alert — deliberately a different sound
  // shape from the kitchen's own new-order beep (KdsClient.tsx), so
  // staff can tell "kitchen has a new ticket" apart from "an order is
  // ready to serve" purely by ear, without looking at a screen.
  useEffect(() => {
    const currentReady = new Set(tables.filter((t) => t.readyCount > 0).map((t) => t.id));
    if (seenReadyTableIds.current === null) {
      seenReadyTableIds.current = currentReady;
      return;
    }
    const newlyReadyIds = [...currentReady].filter((id) => !seenReadyTableIds.current!.has(id));
    if (newlyReadyIds.length > 0) {
      playOrderReadyChime();
      const names = newlyReadyIds.map((id) => tables.find((x) => x.id === id)?.name ?? "Table").join(", ");
      showToast(t("{names} — order ready to serve", { names }));
    }
    seenReadyTableIds.current = currentReady;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, showToast]);

  function playOrderReadyChime() {
    try {
      if (!readyAudioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        readyAudioCtxRef.current = new Ctx();
      }
      const ctx = readyAudioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const ring = (freq: number, startAt: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.9, ctx.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
        oscillator.start(ctx.currentTime + startAt);
        oscillator.stop(ctx.currentTime + startAt + duration);
      };
      // A short, rising three-note chime ("tig-tig-titig" cadence) —
      // ascending pitch reads as "ready/positive", clearly unlike the
      // kitchen's flat beep or urgent double-beep.
      ring(523, 0, 0.14);
      ring(659, 0.13, 0.14);
      ring(784, 0.26, 0.28);
    } catch {
      // Audio isn't critical — fail silently if the browser blocks it.
    }
  }

  useEffect(() => {
    function poll() {
      router.refresh();
      listPendingTableRequestsAction().then(setRequests);
    }
    poll();
    const timer = setInterval(poll, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [bookingTable, setBookingTable] = useState<Table | null>(null);
  const [bookingName, setBookingName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");

  function handleTableTap(table: Table) {
    if (table.openOrderId) {
      router.push(`/restaurant/orders/${table.openOrderId}`);
      return;
    }
    // Genuinely open the booking popup instead of starting the order
    // immediately — this is what lets a customer's name/phone be
    // captured (for loyalty points) without ever being mandatory.
    setBookingName("");
    setBookingPhone("");
    setBookingTable(table);
  }

  function confirmBooking(skipDetails: boolean) {
    if (!bookingTable) return;
    const table = bookingTable;
    setError(null);
    startTransition(async () => {
      const result = await startOrderAction(
        table.id,
        skipDetails ? undefined : bookingName.trim() || undefined,
        skipDetails ? undefined : bookingPhone.trim() || undefined,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setBookingTable(null);
      router.push(`/restaurant/orders/${result.orderId}`);
    });
  }

  function handleClearEmpty(table: Table, e: React.MouseEvent) {
    e.stopPropagation();
    if (!table.openOrderId) return;
    startTransition(async () => {
      const result = await clearEmptyOrderAction(table.openOrderId!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAddTable() {
    if (!newTableName.trim()) return;
    startTransition(async () => {
      const result = await createTableAction(newTableName, newTableSection);
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast(t("{name} added", { name: newTableName.trim() }));
      setNewTableName("");
      setShowAddTable(false);
      router.refresh();
    });
  }

  function handleAddNumbered() {
    startTransition(async () => {
      const result = await createNumberedTablesAction(bulkCount, newTableSection);
      if (result.error) {
        setError(result.error);
        return;
      }
      showToast(t("{n} tables added", { n: result.added ?? bulkCount }));
      setShowAddTable(false);
      router.refresh();
    });
  }

  function showQr(table: Table) {
    setQrTable(table);
    setQrDataUrl(null);
    setRenameValue(table.name);
    setTableActionError(null);
    const fullUrl = `${window.location.origin}/order/${table.qrToken}`;
    getTableQrImageAction(table.id, fullUrl).then((r) => {
      if (r.dataUrl) setQrDataUrl(r.dataUrl);
    });
  }

  function accept(requestId: string) {
    startTransition(async () => {
      const result = await acceptTableOrderRequestAction(requestId);
      if (result.orderId) router.push(`/restaurant/orders/${result.orderId}`);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      router.refresh();
    });
  }
  function reject(requestId: string) {
    startTransition(async () => {
      await rejectTableOrderRequestAction(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("tables.title")}
        action={
          <button onClick={() => setShowAddTable((v) => !v)} className="btn-primary-sm">
            {t("tables.addTable")}
          </button>
        }
        icon={<LayoutGrid size={18} strokeWidth={1.8} />}
      />

      <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
        <Link
          href="/restaurant/reports"
          className="shrink-0 rounded-2xl px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--elev-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {t("tables.salesReports")}
        </Link>
        <Link
          href="/restaurant/combos"
          className="flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--elev-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <Layers size={13} /> {t("Combos")}
        </Link>
        <Link
          href="/restaurant/reservations"
          className="flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--elev-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <CalendarClock size={13} /> {t("Reservations")}
        </Link>
      </div>

      {/* Genuine legend — explains exactly what each table color means, with a
          colored dot per state, matching the real data (Free / Reserved / Occupied). */}
      {tables.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-1 pb-1 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, #34d399, #059669)", boxShadow: "0 0 0 2px var(--background), 0 1px 2px rgba(0,0,0,0.3)" }} />
            {t("tables.free")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, #fbbf24, #d97706)", boxShadow: "0 0 0 2px var(--background), 0 1px 2px rgba(0,0,0,0.3)" }} />
            {t("Reserved")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, #f87171, #dc2626)", boxShadow: "0 0 0 2px var(--background), 0 1px 2px rgba(0,0,0,0.3)" }} />
            <span className="hidden sm:inline">{t("Occupied — tap to bill")}</span>
            <span className="sm:hidden">{t("Occupied")}</span>
          </span>
        </div>
      )}

      {requests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-text"><Smartphone size={14} /> {t("{n} order request(s) from customers", { n: requests.length })}</p>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-foreground">
                {r.tableName}{r.customerName ? ` · ${r.customerName}` : ""}
              </p>
              <p className="text-xs text-muted">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => accept(r.id)} disabled={isPending} className="btn-primary-sm flex items-center gap-1 disabled:opacity-60">
                  <Check size={13} /> {t("Accept")}
                </button>
                <button onClick={() => reject(r.id)} disabled={isPending} className="flex items-center gap-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60">
                  <X size={13} /> {t("Reject")}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {showAddTable && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setShowAddTable(false)}>
          <div
            className="ray-pop w-full max-w-sm rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg sm:rounded-2xl sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-foreground">{t("Add tables")}</p>
                <button
                  type="button"
                  onClick={() => setShowAddTable(false)}
                  aria-label={t("common.close")}
                  className="-mr-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex gap-1.5">
                {(["inside", "outside", "takeaway"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewTableSection(s)}
                    aria-pressed={newTableSection === s}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      newTableSection === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                    }`}
                  >
                    {t(SECTION_LABEL[s])}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background/40 p-3">
                <p className="text-sm font-medium text-foreground">{t("Many at once")}</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setBulkCount((n) => Math.max(1, n - 1))}
                      aria-label={t("Fewer")}
                      className="flex h-10 w-10 items-center justify-center text-foreground"
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      value={bulkCount}
                      onChange={(e) => setBulkCount(Math.min(50, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
                      inputMode="numeric"
                      aria-label={t("Number of tables")}
                      className="h-10 w-12 border-0 bg-transparent text-center text-base font-semibold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setBulkCount((n) => Math.min(50, n + 1))}
                      aria-label={t("More")}
                      className="flex h-10 w-10 items-center justify-center text-foreground"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <button type="button" onClick={handleAddNumbered} disabled={isPending} className="btn-primary-sm h-10 flex-1 disabled:opacity-60">
                    {t("Add {n} tables", { n: bulkCount })}
                  </button>
                </div>
                <p className="text-xs text-muted">{t("Named T1, T2, T3… — rename any of them later from its QR icon.")}</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTable();
                }}
                className="flex flex-col gap-2"
              >
                <p className="text-sm font-medium text-foreground">{t("Or one with its own name")}</p>
                <div className="flex gap-2">
                  <input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder={t("tables.namePlaceholder")}
                    enterKeyHint="done"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <button type="submit" disabled={isPending || !newTableName.trim()} className="rounded-lg border border-brand/40 px-4 text-sm font-semibold text-brand-text disabled:opacity-50">
                    {t("tables.add")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {tables.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {(["all", ...(tables.some((x) => x.isRoom) ? (["rooms"] as const) : []), "inside", "outside", "takeaway"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSectionFilter(s)}
              aria-pressed={sectionFilter === s}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                sectionFilter === s ? "border-brand/30 bg-brand-soft text-brand-text" : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {s === "all" ? t("All tables") : s === "rooms" ? t("Rooms") : t(SECTION_LABEL[s])}
            </button>
          ))}
        </div>
      )}

      {tables.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t("No tables yet")}
          text={t("Add your tables once — then tap a table to take its order.")}
          action={
            <button onClick={() => setShowAddTable(true)} className="btn-primary-sm">
              {t("Add tables")}
            </button>
          }
        />
      ) : (
        visibleTables.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-xs text-muted">{t("Nothing here yet.")}</p>
        ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5 md:gap-4">
          {visibleTables.map((table) => (
            <TableTile
              key={table.id}
              table={table}
              dimmed={isPending}
              freeLabel={t("tables.free")}
              t={t}
              onOpen={() => handleTableTap(table)}
              onQr={() => showQr(table)}
              onClearEmpty={(e) => handleClearEmpty(table, e)}
            />
          ))}
        </div>
        )
      )}

      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setQrTable(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-surface p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("{name} — scan to order", { name: qrTable.name })}</p>
            <p className="mt-1 text-xs text-muted">{t("Print this and stick it on the table.")}</p>
            <div className="mt-3 flex items-center justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small dynamically-generated data URL, next/image adds no value
                <img src={qrDataUrl} alt={t("Table order QR code")} className="h-48 w-48 rounded-lg bg-white p-1" />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center text-xs text-muted">{t("Generating…")}</div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={() =>
                  startTransition(async () => {
                    const result = await renameTableAction(qrTable.id, renameValue);
                    if (result?.error) {
                      setTableActionError(result.error);
                      return;
                    }
                    setTableActionError(null);
                    setQrTable(null);
                    router.refresh();
                  })
                }
                disabled={isPending}
                className="btn-primary-sm disabled:opacity-60"
              >
                {t("Rename")}
              </button>
            </div>
            {tableActionError && <p className="mt-2 text-xs text-danger">{tableActionError}</p>}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  if (!confirm(t("Remove {name}?", { name: qrTable.name }))) return;
                  startTransition(async () => {
                    const result = await deleteTableAction(qrTable.id);
                    if (result?.error) {
                      setTableActionError(result.error);
                      return;
                    }
                    setTableActionError(null);
                    setQrTable(null);
                    router.refresh();
                  });
                }}
                disabled={isPending}
                className="flex-1 rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
              >
                {t("Remove table")}
              </button>
              <button onClick={() => setQrTable(null)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
      {bookingTable && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={() => setBookingTable(null)}>
          <div
            className="w-full max-w-sm rounded-t-2xl bg-surface p-5 md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--elev-sm)" }}
          >
            <p className="text-base font-semibold text-foreground">
              {/^table\b/i.test(bookingTable.name) ? bookingTable.name : t("Table {name}", { name: bookingTable.name })}
            </p>
            <p className="mt-1 text-xs text-muted">{t("Customer's name and mobile earn them loyalty points — optional, you can skip.")}</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <input
                value={bookingName}
                onChange={(e) => setBookingName(e.target.value)}
                placeholder={t("Customer name (optional)")}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <input
                value={bookingPhone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setBookingPhone(digits);
                  if (digits.length === 10) {
                    lookupCustomerByPhoneAction(digits).then((r) => {
                      if (r.name) setBookingName((prev) => (prev.trim() ? prev : r.name!));
                    });
                  }
                }}
                placeholder={t("Mobile number (optional)")}
                inputMode="numeric"
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => confirmBooking(false)}
                disabled={isPending}
                className="btn-primary w-full text-center disabled:opacity-60"
              >
                {isPending ? t("Starting…") : t("Start order")}
              </button>
              <button
                onClick={() => confirmBooking(true)}
                disabled={isPending}
                className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-muted disabled:opacity-60"
              >
                {t("Skip — start without details")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
