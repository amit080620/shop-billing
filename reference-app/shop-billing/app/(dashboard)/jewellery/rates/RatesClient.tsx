"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Circle } from "lucide-react";
import { setTodaysMetalRateAction } from "@/lib/actions/jewellery";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Coins } from "lucide-react";

type HistoryRow = { metalType: string; rate: number; date: string };

export function RatesClient({
  todayGold,
  todaySilver,
  history,
}: {
  todayGold: number | null;
  todaySilver: number | null;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const [gold, setGold] = useState<number | "">(todayGold ?? "");
  const [silver, setSilver] = useState<number | "">(todaySilver ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(metal: "gold" | "silver", value: number | "") {
    if (typeof value !== "number" || value <= 0) {
      setError("Enter a valid rate");
      return;
    }
    startTransition(async () => {
      const result = await setTodaysMetalRateAction(metal, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Today's rate"
        subtitle="Set the per-gram rate each morning — it applies to every gold/silver item billed today."
        icon={<Coins size={18} strokeWidth={1.8} />}
      />
      <Link href="/products" className="text-sm text-muted">
        ← Items
      </Link>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-brand-text"><Circle size={10} className="fill-amber-400 text-amber-400" /> Gold rate (₹ per gram)</span>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={gold}
              onChange={(e) => setGold(e.target.value === "" ? "" : Number(e.target.value))}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={() => save("gold", gold)} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
              Save
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-brand-text"><Circle size={10} className="fill-slate-400 text-slate-400" /> Silver rate (₹ per gram)</span>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={silver}
              onChange={(e) => setSilver(e.target.value === "" ? "" : Number(e.target.value))}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={() => save("silver", silver)} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
              Save
            </button>
          </div>
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Recent rates</p>
        {history.length === 0 ? (
          <EmptyState text="No rates set yet." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <Circle size={8} className={h.metalType === "gold" ? "fill-amber-400 text-amber-400" : "fill-slate-400 text-slate-400"} /> {new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                <span className="font-medium text-foreground">{formatMoney(h.rate)}/g</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
