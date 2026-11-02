"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney } from "@/lib/format";
import { movementGst } from "@/lib/garment/rules";
import { createTransferAction } from "@/lib/actions/garment";
import { ActionButton, LinesEditor, type EditLine } from "../../ui";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";
type G = { id: string; name: string; gstin: string | null; stateCode: string | null };

export function NewTransferClient({ godowns, stock }: { godowns: G[]; stock: { id: string; name: string; sku: string | null; barcode: string | null; price: number; byGodown: Record<string, number> }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [from, setFrom] = useState(godowns[0]?.id ?? "");
  const [to, setTo] = useState(godowns[1]?.id ?? "");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [f, setF] = useState({ remarks: "", movementReason: "Stock transfer between own places", transporter: "", vehicleNumber: "", challanRef: "", ewayBillNo: "" });
  const items = useMemo(() => stock.filter((s) => (s.byGodown[from] ?? 0) > 0).map((s) => ({ id: s.id, name: s.name, sku: s.sku, barcode: s.barcode, stock: s.byGodown[from] ?? 0 })), [stock, from]);
  const price = useMemo(() => new Map(stock.map((s) => [s.id, s.price])), [stock]);
  const value = lines.reduce((s, l) => s + l.quantity * (price.get(l.productId) ?? 0), 0);
  const gf = godowns.find((g) => g.id === from);
  const gt = godowns.find((g) => g.id === to);
  const gst = movementGst({ fromGstin: gf?.gstin, toGstin: gt?.gstin, fromState: gf?.stateCode, toState: gt?.stateCode, value });

  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card grid grid-cols-2 gap-2 p-4">
        <label className="text-xs text-muted">
          {t("From")}
          <select
            value={from}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(v);
              setLines([]);
              if (v === to) setTo(godowns.find((g) => g.id !== v)?.id ?? "");
            }}
            className={FIELD}
          >
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
      </section>
      <LinesEditor items={items} lines={lines} setLines={setLines} showMax />
      <section className={`flex flex-col gap-1.5 rounded-xl border p-3.5 text-sm ${gst.review ? "border-warning/40 bg-warning-soft" : "border-border bg-surface-2"}`}>
        <p className="font-semibold text-foreground">
          {t("GST for this movement")} · {t("about")} {formatMoney(value)}
        </p>
        {gst.notes.map((n) => (
          <p key={n} className="text-xs text-foreground">
            {t(n)}
          </p>
        ))}
        <p className="text-[11px] text-muted">{t("The app records the papers; it never decides tax on a movement by itself.")}</p>
      </section>
      <section className="neu-card grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        <input value={f.movementReason} onChange={(e) => setF({ ...f, movementReason: e.target.value })} placeholder={t("Reason for movement")} className={FIELD} />
        <input value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} placeholder={t("Transporter")} className={FIELD} />
        <input value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value })} placeholder={t("Vehicle number")} className={FIELD} />
        <input value={f.challanRef} onChange={(e) => setF({ ...f, challanRef: e.target.value })} placeholder={t("Delivery challan ref.")} className={FIELD} />
        <input value={f.ewayBillNo} onChange={(e) => setF({ ...f, ewayBillNo: e.target.value })} placeholder={t("E-way bill no. (if needed)")} className={FIELD} />
        <input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder={t("Remarks")} className={FIELD} />
      </section>
      <div>
        <ActionButton
          kind="primary"
          label={t("Save transfer")}
          run={() => createTransferAction({ fromId: from, toId: to, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), ...f })}
          then={(id) => id && router.push(`/garment/transfers/${id}`)}
        />
      </div>
    </div>
  );
}
