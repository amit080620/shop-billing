"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { formatMoney } from "@/lib/format";

export type PriceAlert = { productName: string; newCost: number; currentSalePrice: number };

/** Stock quantities merge automatically and correctly (that part was
 * never in question) — this is specifically about the case the person
 * asked about: buying the SAME product again at a HIGHER cost than
 * before. Silently adding 2 more iPhones to an existing 8 in stock is
 * completely correct for the quantity — but if the sale price still
 * reflects the OLD, cheaper cost, every one of the new units sells at
 * a loss until someone notices and fixes the price by hand. This
 * banner is that notice, right where it's needed, the moment it
 * happens — not a silent number change buried in a report. */
export function PriceAlertBanner({ alerts }: { alerts: PriceAlert[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (alerts.length === 0 || dismissed) return null;

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-danger bg-danger-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm font-semibold text-danger">Purchase rate went up — update the sale price</p>
        </div>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 text-danger">
          <X size={16} />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5 pl-6">
        {alerts.map((a, i) => (
          <li key={i} className="text-xs text-foreground">
            <span className="font-medium">{a.productName}</span> — new cost {formatMoney(a.newCost)}, sale price only {formatMoney(a.currentSalePrice)}
            {a.newCost >= a.currentSalePrice ? " — you would sell at a loss" : " — the margin is now very thin"}.
          </li>
        ))}
      </ul>
      <Link href="/products" className="self-start rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white">
        Update prices in Products
      </Link>
    </div>
  );
}
