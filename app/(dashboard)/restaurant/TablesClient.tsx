"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTableAction, startOrderAction, renameTableAction, deleteTableAction } from "@/lib/actions/restaurant";
import {
  listPendingTableRequestsAction,
  acceptTableOrderRequestAction,
  rejectTableOrderRequestAction,
  getTableQrImageAction,
} from "@/lib/actions/table-orders";
import { LayoutGrid } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Table = {
  id: string;
  name: string;
  status: "free" | "occupied";
  openOrderId: string | null;
  openOrderTotal: number;
  readyCount: number;
  qrToken: string;
  reservation: { customerName: string; time: string; partySize: number } | null;
};
type PendingRequest = { id: string; tableId: string; tableName: string; customerName: string | null; createdAt: string; items: { name: string; quantity: number }[] };

export function TablesClient({ tables, lang }: { tables: Table[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tableActionError, setTableActionError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);

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

  function handleAddTable() {
    if (!newTableName.trim()) return;
    startTransition(async () => {
      const result = await createTableAction(newTableName);
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
        <Link href="/restaurant/reports" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("tables.salesReports")}
        </Link>
        <Link href="/restaurant/combos" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          🍱 Combos
        </Link>
        <Link href="/restaurant/reservations" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          📅 Reservations
        </Link>
      </div>

      {requests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
          <p className="text-sm font-semibold text-brand-dark">📱 {requests.length} customer order request(s)</p>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-foreground">
                {r.tableName}{r.customerName ? ` · ${r.customerName}` : ""}
              </p>
              <p className="text-xs text-muted">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => accept(r.id)} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
                  ✓ Accept
                </button>
                <button onClick={() => reject(r.id)} disabled={isPending} className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60">
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {showAddTable && (
        <div className="flex gap-2">
          <input
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            placeholder={t("tables.namePlaceholder")}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={handleAddTable} disabled={isPending} className="btn-primary-sm">
            {t("tables.add")}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {tables.length === 0 ? (
        <EmptyState text={t("tables.empty")} />
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5 md:gap-4">
          {tables.map((table) => (
            <div
              key={table.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTableTap(table)}
              className={`hover-lift relative flex flex-col items-center justify-center gap-1 rounded-xl border p-4 shadow-sm md:gap-1.5 md:rounded-2xl md:p-6 ${
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
                  🔔
                </span>
              )}
              {!table.readyCount && table.status !== "occupied" && table.reservation && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  📅
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
                ▦
              </button>
              <span className={`text-sm font-semibold md:text-lg ${table.status === "occupied" ? "text-danger" : table.reservation ? "text-amber-700" : "text-brand-dark"}`}>
                {table.name}
              </span>
              <span className={`text-[11px] md:text-xs ${table.status === "occupied" ? "text-danger" : table.reservation ? "text-amber-700" : "text-brand-dark"}`}>
                {table.status === "occupied"
                  ? formatMoney(table.openOrderTotal)
                  : table.reservation
                    ? `📅 ${table.reservation.time} — ${table.reservation.customerName}`
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
