"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { carryForwardAction, closeYearAction } from "@/lib/actions/garment";
import { ActionButton } from "../ui";

type Candidate = { fy: string; closingDate: string; daysLate: number };

export function CloseYear({ candidates }: { candidates: Candidate[] }) {
  const { t } = useT();
  const [fy, setFy] = useState(candidates[0]?.fy ?? "");
  const [note, setNote] = useState("");
  const c = candidates.find((x) => x.fy === fy);
  if (!c) return <p className="text-xs text-muted">{t("No year is ready to close. A year can be closed on its last day (31 March) or after it.")}</p>;
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <p className="text-sm font-bold text-foreground">{t("Close a financial year")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          {t("Financial year")}
          <select value={fy} onChange={(e) => setFy(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm">
            {candidates.map((x) => (
              <option key={x.fy} value={x.fy}>
                {x.fy}
              </option>
            ))}
          </select>
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm" />
      </div>
      <p className={`text-xs ${c.daysLate > 1 ? "text-warning" : "text-muted"}`}>
        {c.daysLate > 1
          ? t("The closing is a snapshot of stock right now, {n} days after {d}. If goods have been sold or bought since, this won't be the 31 March stock — count the godowns first.", { n: c.daysLate, d: c.closingDate })
          : t("The closing is a snapshot of stock right now. Close after the last sale of the year and before the first sale of the next.")}
      </p>
      <div>
        <ActionButton kind="primary" label={t("Close FY {fy}", { fy: c.fy })} confirm={t("Close FY {fy}? A year is closed only once.", { fy: c.fy })} run={() => closeYearAction(c.fy, c.closingDate, note)} />
      </div>
    </section>
  );
}

export function CarryForward({ id, fy, openingDate }: { id: string; fy: string; openingDate: string }) {
  const { t } = useT();
  return <ActionButton kind="primary" label={t("Carry forward")} confirm={t("Open the next year with FY {fy}'s closing stock? This is done once; it records the opening balances and creates no new stock.", { fy })} run={() => carryForwardAction(id, openingDate)} />;
}
