"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTableAction, startOrderAction, renameTableAction, deleteTableAction, clearEmptyOrderAction } from "@/lib/actions/restaurant";
import {
  listPendingTableRequestsAction,
  acceptTableOrderRequestAction,
  rejectTableOrderRequestAction,
  getTableQrImageAction,
} from "@/lib/actions/table-orders";
import { LayoutGrid, Layers, CalendarClock, Smartphone, Check, X, Bell, QrCode } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { useToast } from "@/app/components/Toast";
import { EmptyState } from "@/app/components/EmptyState";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Table = {
  id: string;
  name: string;
  status: "free" | "occupied";
  section: "inside" | "outside" | "takeaway" | null;
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
const SECTION_BADGE: Record<"inside" | "outside" | "takeaway", { letter: string; className: string }> = {
  // Muted, professional tones — distinguishable at a glance without
  // being bright/childish (brief explicitly asked to avoid that).
  inside: { letter: "I", className: "bg-info-soft text-info" },
  outside: { letter: "O", className: "bg-success-soft text-success" },
  takeaway: { letter: "T", className: "bg-warning-soft text-warning" },
};

export function TablesClient({ tables, lang }: { tables: Table[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSection, setNewTableSection] = useState<"inside" | "outside" | "takeaway">("inside");
  const [sectionFilter, setSectionFilter] = useState<"all" | "inside" | "outside" | "takeaway">("all");
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
      const names = newlyReadyIds.map((id) => tables.find((t) => t.id === id)?.name ?? "Table").join(", ");
      showToast(`${names} — order ready to serve`);
    }
    seenReadyTableIds.current = currentReady;
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
        gain.gain.setValueAtTime(0.45, ctx.currentTime + startAt);
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

  function handleTableTap(table: Table) {
    setError(null);
    startTransition(async () => {
      if (table.openOrderId) {
        router.push(`/restaurant/orders/${table.openOrderId}`);
        return;
      }
      const result = await startOrderAction(table.id);
      if (result.error) {
        setError(result.error);
        return;
      }
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
      setNewTableName("");
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("tables.title")}
        action={
          <button onClick={() => setShowAddTable((v) => !v)} className="btn-primary-sm">
            {t("tables.addTable")}
          </button>
        }
        icon={<LayoutGrid size={18} strokeWidth={1.8} />}
      />

      <div className="flex gap-2 overflow-x-auto">
        <Link
          href="/restaurant/reports"
          className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          {t("tables.salesReports")}
        </Link>
        <Link
          href="/restaurant/combos"
          className="flex shrink-0 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          <Layers size={12} /> Combos
        </Link>
        <Link
          href="/restaurant/reservations"
          className="flex shrink-0 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          <CalendarClock size={12} /> Reservations
        </Link>
      </div>

      {requests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-text"><Smartphone size={14} /> {requests.length} customer order request(s)</p>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-foreground">
                {r.tableName}{r.customerName ? ` · ${r.customerName}` : ""}
              </p>
              <p className="text-xs text-muted">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => accept(r.id)} disabled={isPending} className="btn-primary-sm flex items-center gap-1 disabled:opacity-60">
                  <Check size={13} /> Accept
                </button>
                <button onClick={() => reject(r.id)} disabled={isPending} className="flex items-center gap-1 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60">
                  <X size={13} /> Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {showAddTable && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setShowAddTable(false)}>
        <div className="ray-pop w-full max-w-sm rounded-t-2xl bg-surface p-4 shadow-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">{t("tables.add")}</p>
          <input
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder={t("tables.namePlaceholder")}
            autoFocus
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex gap-1.5">
            {(["inside", "outside", "takeaway"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNewTableSection(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  newTableSection === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                }`}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </div>
          <button onClick={handleAddTable} disabled={isPending} className="btn-primary-sm">
            {t("tables.add")}
          </button>
        </div>
        </div>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {tables.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(["all", "inside", "outside", "takeaway"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSectionFilter(s)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                sectionFilter === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
              style={
                sectionFilter === s
                  ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                  : undefined
              }
            >
              {s === "all" ? "All tables" : SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {tables.length === 0 ? (
        <EmptyState text={t("tables.empty")} />
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5 md:gap-4">
          {tables
            .filter((table) => sectionFilter === "all" || (table.section ?? "inside") === sectionFilter)
            .map((table) => (
            <div
              key={table.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTableTap(table)}
              style={{ boxShadow: "-6px -6px 14px var(--neu-light), 6px 6px 14px var(--neu-dark)" }}
              className={`hover-lift relative flex flex-col items-center justify-center gap-1 rounded-xl border p-4 md:gap-1.5 md:rounded-2xl md:p-6 ${
                isPending ? "opacity-60" : ""
              } ${
                table.status === "occupied"
                  ? "border-danger bg-red-50"
                  : table.reservation
                    ? "border-amber-500 bg-amber-50"
                    : "border-brand bg-brand-soft"
              }`}
            >
              {table.readyCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                  <Bell size={11} />
                </span>
              )}
              {!table.readyCount && table.status !== "occupied" && table.reservation && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  <CalendarClock size={11} />
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  showQr(table);
                }}
                className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-[10px] text-white"
                aria-label="Show QR code"
              >
                <QrCode size={11} />
              </button>
              <span
                className={`absolute -bottom-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${SECTION_BADGE[table.section ?? "inside"].className}`}
                title={SECTION_LABEL[table.section ?? "inside"]}
              >
                {SECTION_BADGE[table.section ?? "inside"].letter}
              </span>
              <span className={`text-sm font-semibold md:text-lg ${table.status === "occupied" ? "text-danger" : table.reservation ? "text-amber-700" : "text-brand-text"}`}>
                {table.name}
              </span>
              <span className={`text-[11px] md:text-xs ${table.status === "occupied" ? "text-danger" : table.reservation ? "text-amber-700" : "text-brand-text"}`}>
                {table.status === "occupied"
                  ? table.openOrderTotal === 0
                    ? (
                      <button onClick={(e) => handleClearEmpty(table, e)} className="underline decoration-dotted">
                        Free table
                      </button>
                    )
                    : formatMoney(table.openOrderTotal)
                  : table.reservation
                    ? `${table.reservation.time} — ${table.reservation.customerName}`
                    : t("tables.free")}
              </span>
            </div>
          ))}
        </div>
      )}

      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setQrTable(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-surface p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{qrTable.name} — Scan to order</p>
            <p className="mt-1 text-xs text-muted">Print this and stick it on the table.</p>
            <div className="mt-3 flex items-center justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small dynamically-generated data URL, next/image adds no value
                <img src={qrDataUrl} alt="Table order QR code" className="h-48 w-48" />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center text-xs text-muted">Generating…</div>
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
                Rename
              </button>
            </div>
            {tableActionError && <p className="mt-2 text-xs text-danger">{tableActionError}</p>}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  if (!confirm(`Remove ${qrTable.name}?`)) return;
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
                Remove table
              </button>
              <button onClick={() => setQrTable(null)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
