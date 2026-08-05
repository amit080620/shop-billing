"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTableAction, startOrderAction } from "@/lib/actions/restaurant";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Table = { id: string; name: string; status: "free" | "occupied"; openOrderId: string | null; openOrderTotal: number; readyCount: number };

export function TablesClient({ tables, lang }: { tables: Table[]; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [router]);
  const [isPending, startTransition] = useTransition();
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("tables.title")}
        action={
          <button onClick={() => setShowAddTable((v) => !v)} className="btn-primary-sm">
            {t("tables.addTable")}
          </button>
        }
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="10" width="18" height="4" rx="1" />
            <path d="M6 14v5M18 14v5" />
          </svg>
        }
      />

      <div className="flex gap-2 overflow-x-auto">
        <Link href="/restaurant/reports" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("tables.salesReports")}
        </Link>
      </div>

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
        <div className="grid grid-cols-3 gap-3">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleTableTap(table)}
              disabled={isPending}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border p-4 shadow-sm disabled:opacity-60 ${
                table.status === "occupied"
                  ? "border-danger bg-red-50"
                  : "border-brand bg-brand-soft"
              }`}
            >
              {table.readyCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                  🔔
                </span>
              )}
              <span className={`text-sm font-semibold ${table.status === "occupied" ? "text-danger" : "text-brand-dark"}`}>
                {table.name}
              </span>
              <span className={`text-[11px] ${table.status === "occupied" ? "text-danger" : "text-brand-dark"}`}>
                {table.status === "occupied" ? formatMoney(table.openOrderTotal) : t("tables.free")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
