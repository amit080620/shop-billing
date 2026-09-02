"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Package, IndianRupee, TrendingDown, Loader2 } from "lucide-react";
import { getProfitLeakAction, type ProfitLeak } from "@/lib/actions/profitLeak";
import { formatMoney } from "@/lib/format";
import Link from "next/link";

export function ProfitLeakClient() {
  const [data, setData] = useState<ProfitLeak | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProfitLeakAction().then((result) => {
      setData(result);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-sm">Aapka poora data check kar rahe hain…</p>
      </div>
    );
  }

  if (!data) return null;

  const categories = [
    {
      icon: <Clock size={18} />,
      label: "Expire hone wala stock",
      sub: `${data.expiringStockCount} batch${data.expiringStockCount === 1 ? "" : "es"} — agle 30 din mein`,
      value: data.expiringStockValue,
      href: "/expiry-alerts",
    },
    {
      icon: <Package size={18} />,
      label: "Dead stock (90 din se nahi bika)",
      sub: `${data.deadStockCount} product${data.deadStockCount === 1 ? "" : "s"} — paisa shelf mein phansa hai`,
      value: data.deadStockValue,
      href: "/products",
    },
    {
      icon: <IndianRupee size={18} />,
      label: "Purana udhar (30+ din se pending)",
      sub: `${data.overdueUdharCount} customer${data.overdueUdharCount === 1 ? "" : "s"} — collect karna baaki hai`,
      value: data.overdueUdharValue,
      href: "/customers",
    },
    {
      icon: <TrendingDown size={18} />,
      label: "Cost se kam/barabar price par bik raha",
      sub: `${data.belowCostItems.length} item — har sale par loss ho raha hai`,
      value: data.belowCostValue,
      href: "/products",
    },
  ].filter((c) => c.value > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-br from-danger to-[#7c1d1d] p-6 text-center text-white">
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">
          <AlertTriangle size={13} /> ABHI RISK MEIN
        </div>
        <p className="text-4xl font-extrabold">{formatMoney(data.totalAtRisk)}</p>
        <p className="text-xs opacity-80">Ye paisa genuinely kho sakta hai agar abhi action nahi liya</p>
      </div>

      {categories.length === 0 ? (
        <div className="neu-card p-6 text-center">
          <p className="text-sm font-medium text-success">🎉 Koi genuine leak nahi mila — aapka business tight hai!</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {categories.map((c, i) => (
            <li key={i} className="neu-card flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">{c.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{c.label}</p>
                <p className="text-xs text-muted">{c.sub}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-bold text-danger">{formatMoney(c.value)}</p>
                <Link href={c.href} className="text-[11px] font-medium text-brand-text">
                  Dekhein →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.belowCostItems.length > 0 && (
        <div className="neu-card flex flex-col gap-2 p-3.5">
          <p className="text-sm font-semibold text-foreground">Loss par bik rahe items</p>
          {data.belowCostItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-foreground">{item.name}</span>
              <span className="text-danger">Cost {formatMoney(item.cost)} → Sale {formatMoney(item.salePrice)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
