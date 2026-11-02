"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { moveNowAction } from "@/lib/actions/garment";
import { ActionButton, LinesEditor, type EditLine } from "../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

export function MoveClient({ godowns, stock }: { godowns: { id: string; name: string; isDefault: boolean }[]; stock: { id: string; name: string; sku: string | null; barcode: string | null; byGodown: Record<string, number> }[] }) {
  const { t } = useT();
  const [from, setFrom] = useState(godowns.find((g) => !g.isDefault)?.id ?? godowns[0]?.id ?? "");
  const [to, setTo] = useState(godowns.find((g) => g.isDefault)?.id ?? godowns[1]?.id ?? "");
  const [kind, setKind] = useState<"move" | "put_away" | "return_to_godown">("move");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const items = useMemo(() => stock.filter((s) => (s.byGodown[from] ?? 0) > 0).map((s) => ({ id: s.id, name: s.name, sku: s.sku, barcode: s.barcode, stock: s.byGodown[from] ?? 0 })), [stock, from]);

  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
        <label className="text-xs text-muted">
          {t("From")}
          <select value={from} onChange={(e) => { setFrom(e.target.value); setLines([]); }} className={FIELD}>
            {godowns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("To")}
          <select value={to} onChange={(e) => setTo(e.target.value)} className={FIELD}>
            {godowns.filter((g) => g.id !== from).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("Why")}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={FIELD}>
            <option value="move">{t("Move")}</option>
            <option value="put_away">{t("Put a purchase away")}</option>
            <option value="return_to_godown">{t("Back from the shop floor")}</option>
          </select>
        </label>
      </section>
      <LinesEditor items={items} lines={lines} setLines={setLines} showMax />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className={FIELD} />
      <div>
        <ActionButton
          kind="primary"
          label={t("Move now")}
          run={() => moveNowAction(from, to, lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), kind, note)}
          then={() => { setLines([]); setNote(""); }}
        />
      </div>
    </div>
  );
}
