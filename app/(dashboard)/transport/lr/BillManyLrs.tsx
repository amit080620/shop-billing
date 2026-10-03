"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/link";
import { billConsignmentsAction } from "@/lib/actions/consignments";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Lr = { id: string; lrNumber: string; date: string; route: string; total: number; status: string };
type Group = { party: string; lrs: Lr[] };

/** LRs waiting for their freight bill, party by party: tick several for one party and bill them
 * together (the monthly bill of a "to be billed" account). */
export function BillManyLrs({ groups }: { groups: Group[] }) {
  const { t } = useT();
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [gst, setGst] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function bill(party: string) {
    const ids = picked[party] ?? [];
    setError(null);
    start(async () => {
      const r = await billConsignmentsAction({ ids, gstPercent: gst, paidAmount: 0, paymentMethod: "cash" });
      if (r.error || !r.billId) {
        setError(r.error ?? t("Could not save — try again."));
        return;
      }
      router.push(`/print/bill/${r.billId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-xs text-muted">
        {t("GST on freight")}
        <select value={gst} onChange={(e) => setGst(Number(e.target.value))} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand">
          <option value={0}>{t("0% — reverse charge (the party pays GST)")}</option>
          <option value={5}>5%</option>
          <option value={12}>12%</option>
          <option value={18}>18%</option>
        </select>
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      {groups.map((g) => {
        const ids = picked[g.party] ?? [];
        const sum = g.lrs.filter((l) => ids.includes(l.id)).reduce((s, l) => s + l.total, 0);
        const toggle = (id: string) => setPicked((p) => ({ ...p, [g.party]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }));
        return (
          <section key={g.party} className="neu-card flex flex-col gap-2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{g.party}</p>
              <button type="button" onClick={() => setPicked((p) => ({ ...p, [g.party]: ids.length === g.lrs.length ? [] : g.lrs.map((l) => l.id) }))} className="text-xs font-medium text-brand-text">
                {ids.length === g.lrs.length ? t("Clear") : t("Pick all")}
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {g.lrs.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={ids.includes(l.id)} onChange={() => toggle(l.id)} aria-label={l.lrNumber} />
                  <Link href={`/transport/lr/${l.id}`} className="min-w-0 flex-1 truncate text-foreground">
                    {l.lrNumber} · {l.date} · {l.route}
                  </Link>
                  <span className="shrink-0 font-medium text-foreground">{formatMoney(l.total)}</span>
                </li>
              ))}
            </ul>
            {ids.length > 0 && (
              <button type="button" disabled={pending} onClick={() => bill(g.party)} className="btn-primary text-center disabled:opacity-60">
                {pending ? t("Saving…") : t("Bill {n} LR(s) — {amount} on udhaar", { n: ids.length, amount: formatMoney(sum) })}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
