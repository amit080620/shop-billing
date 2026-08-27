"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ShoppingCart, Wallet, Plus, ArrowRight } from "lucide-react";

type Purchase = { id: string; vendorName: string; purchaseDate: string; billNumber: string; total: number; paidAmount: number; outstanding: number; paymentMethod: string };
type Payment = { id: string; vendorName: string; amount: number; paymentMethod: string; note: string | null; createdAt: string };

export function PurchaseHubClient({ purchases, payments }: { purchases: Purchase[]; payments: Payment[] }) {
  const [topContext, setTopContext] = useState<"purchase" | "history">("purchase");
  const [historyTab, setHistoryTab] = useState<"purchase" | "payments">("purchase");

  const totalPurchase = purchases.reduce((s, p) => s + p.total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalOutstanding = purchases.reduce((s, p) => s + p.outstanding, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Purchase" icon={<ShoppingCart size={18} strokeWidth={1.8} />} />

      <div className="flex gap-2">
        {(["purchase", "history"] as const).map((ctx) => (
          <button
            key={ctx}
            onClick={() => setTopContext(ctx)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
              topContext === ctx ? "bg-brand text-white" : "border border-border text-muted"
            }`}
          >
            {ctx === "purchase" ? "Purchase" : "Purchase History"}
          </button>
        ))}
      </div>

      {topContext === "purchase" ? (
        <div className="flex flex-col gap-3">
          <Link href="/purchases/new" className="neu-card flex items-center gap-3 p-4 transition active:scale-[0.98]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Plus size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Add Purchase</p>
              <p className="text-xs text-muted">Record a new purchase from a supplier</p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-muted" />
          </Link>

          <Link href="/vendors" className="neu-card flex items-center gap-3 p-4 transition active:scale-[0.98]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Wallet size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Make Payment</p>
              <p className="text-xs text-muted">Pick a supplier to settle their outstanding balance</p>
            </div>
            <ArrowRight size={16} className="shrink-0 text-muted" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="neu-card p-3">
              <p className="text-[11px] text-muted">Total Purchase</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(totalPurchase)}</p>
            </div>
            <div className="neu-card p-3">
              <p className="text-[11px] text-muted">Total Payments</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(totalPaid)}</p>
            </div>
            <div className="neu-card p-3">
              <p className="text-[11px] text-muted">Outstanding</p>
              <p className="text-sm font-semibold text-danger">{formatMoney(totalOutstanding)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {(["purchase", "payments"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setHistoryTab(tab)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  historyTab === tab ? "bg-brand-soft text-brand-text" : "text-muted"
                }`}
              >
                {tab === "purchase" ? "Purchase" : "Payments"}
              </button>
            ))}
          </div>

          {historyTab === "purchase" ? (
            purchases.length === 0 ? (
              <EmptyState text="No purchases yet — purchase records will appear here once you add one." />
            ) : (
              <ul className="flex flex-col gap-2">
                {purchases.map((p) => (
                  <li key={p.id} className="neu-card flex items-center justify-between p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.vendorName}</p>
                      <p className="text-xs text-muted">
                        Bill #{p.billNumber} · {new Date(p.purchaseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">{formatMoney(p.total)}</p>
                      {p.outstanding > 0 ? (
                        <p className="text-[11px] text-danger">{formatMoney(p.outstanding)} due</p>
                      ) : (
                        <p className="text-[11px] text-emerald-600">Paid</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : payments.length === 0 ? (
            <EmptyState text="No supplier payments yet — payments will appear here once you record one." />
          ) : (
            <ul className="flex flex-col gap-2">
              {payments.map((p) => (
                <li key={p.id} className="neu-card flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.vendorName}</p>
                    <p className="text-xs text-muted">
                      {p.paymentMethod.toUpperCase()} · {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(p.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
