"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/LangContext";

type Group = { party: string; customerId: string | null; challans: { id: string; number: string; date: string; summary: string }[] };

/** Open challans party by party: tick several of one party and make one bill for them. */
export function BillManyChallans({ groups }: { groups: Group[] }) {
  const { t } = useT();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const key = g.customerId ?? g.party;
        const ids = picked[key] ?? [];
        const toggle = (id: string) => setPicked((p) => ({ ...p, [key]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }));
        return (
          <section key={key} className="neu-card flex flex-col gap-2 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{g.party}</p>
              <button type="button" onClick={() => setPicked((p) => ({ ...p, [key]: ids.length === g.challans.length ? [] : g.challans.map((c) => c.id) }))} className="shrink-0 text-xs font-medium text-brand-text">
                {ids.length === g.challans.length ? t("Clear") : t("Pick all")}
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {g.challans.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} aria-label={c.number} />
                  <Link href={`/challans/${c.id}`} className="min-w-0 flex-1 truncate text-foreground">
                    {c.number} · {c.date} · {c.summary}
                  </Link>
                </li>
              ))}
            </ul>
            {ids.length > 0 && (
              <Link href={`/bills/new?challans=${ids.join(",")}`} className="btn-primary text-center">
                {t("Make one bill for {n} challan(s) →", { n: ids.length })}
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
