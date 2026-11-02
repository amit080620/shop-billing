"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { addVariantsAction, openingStockAction } from "@/lib/actions/garment";
import { ActionButton } from "../../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";

export function StyleDetailClient({ styleId, isOwner, godowns, variants }: { styleId: string; isOwner: boolean; godowns: { id: string; name: string; isDefault: boolean }[]; variants: { id: string; name: string; sku: string | null; barcode: string | null }[] }) {
  const { t } = useT();
  const [colours, setColours] = useState("");
  const [sizes, setSizes] = useState("");
  const [godown, setGodown] = useState(godowns.find((g) => g.isDefault)?.id ?? godowns[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="neu-card flex flex-col gap-2.5 p-4">
        <p className="text-sm font-bold text-foreground">{t("Add colours or sizes")}</p>
        <input value={colours} onChange={(e) => setColours(e.target.value)} placeholder={t("New colours (leave empty to keep the same)")} className={FIELD} />
        <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder={t("New sizes (leave empty to keep the same)")} className={FIELD} />
        <p className="text-xs text-muted">{t("Every missing colour × size is created; the ones you have stay as they are.")}</p>
        <div>
          <ActionButton kind="primary" label={t("Add")} run={() => addVariantsAction(styleId, colours, sizes)} then={() => { setColours(""); setSizes(""); }} />
        </div>
      </section>

      {isOwner && godowns.length > 0 && (
        <section className="neu-card flex flex-col gap-2.5 p-4">
          <p className="text-sm font-bold text-foreground">{t("Opening stock")}</p>
          <select value={godown} onChange={(e) => setGodown(e.target.value)} className={FIELD} aria-label={t("Godown")}>
            {godowns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{v.name}</span>
                <input type="number" min={0} step="1" value={qty[v.id] ?? ""} onChange={(e) => setQty({ ...qty, [v.id]: e.target.value })} className="w-20 rounded-lg py-1.5 text-center text-sm" aria-label={t("Quantity")} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t("Adds to what is already counted there, as an opening entry in the stock history.")}</p>
          <div>
            <ActionButton
              kind="primary"
              label={t("Save opening stock")}
              run={() => openingStockAction(godown, Object.entries(qty).map(([productId, q]) => ({ productId, quantity: Number(q) })))}
              then={() => setQty({})}
            />
          </div>
        </section>
      )}
    </div>
  );
}
