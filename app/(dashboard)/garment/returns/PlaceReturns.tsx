"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { formatDateTime } from "@/lib/format";
import { dispositionReturnAction } from "@/lib/actions/garment";
import { RETURN_DISPOSITION_LABEL as LABEL, type ReturnDisposition as Disposition } from "@/lib/garment/rules";
import { ActionButton } from "../ui";

type Line = { id: string; name: string; returnNumber: string; at: string; left: number };

export function PlaceReturns({ lines, floorId, godowns }: { lines: Line[]; floorId: string; godowns: { id: string; name: string }[] }) {
  const { t } = useT();
  if (!lines.length) return <p className="neu-card p-4 text-sm text-muted">{t("Every returned piece has been placed.")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((l) => (
        <PlaceRow key={l.id} l={l} floorId={floorId} godowns={godowns} />
      ))}
    </ul>
  );
}

function PlaceRow({ l, floorId, godowns }: { l: Line; floorId: string; godowns: { id: string; name: string }[] }) {
  const { t } = useT();
  const [qty, setQty] = useState(String(l.left));
  const [d, setD] = useState<Disposition>("to_godown");
  const others = godowns.filter((g) => g.id !== floorId);
  const targets = d === "to_godown" ? others : godowns;
  const [godown, setGodown] = useState(others[0]?.id ?? floorId);
  const target = targets.some((g) => g.id === godown) ? godown : (targets[0]?.id ?? floorId);
  return (
    <li className="neu-card flex flex-col gap-2 p-3.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{l.name}</span>
        <span className="block text-xs text-muted">
          {l.returnNumber} · {formatDateTime(l.at)} · {t("{n} to place", { n: l.left })}
        </span>
      </span>
      <div className="flex flex-wrap items-start gap-2">
        <input type="number" min={0} max={l.left} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 rounded-lg py-1.5 text-center text-sm" aria-label={t("Quantity")} />
        <select value={d} onChange={(e) => setD(e.target.value as Disposition)} className="rounded-lg px-2 py-1.5 text-xs" aria-label={t("What happens to it")}>
          {(Object.keys(LABEL) as Disposition[]).map((k) => (
            <option key={k} value={k} disabled={k === "to_godown" && others.length === 0}>
              {t(LABEL[k])}
            </option>
          ))}
        </select>
        {d !== "keep" && (
          <select value={target} onChange={(e) => setGodown(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs" aria-label={t("Godown")}>
            {targets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <ActionButton kind="primary" label={t("Place")} run={() => dispositionReturnAction(l.id, Number(qty), d, d === "keep" ? null : target, "")} />
      </div>
    </li>
  );
}
