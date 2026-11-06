"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LangContext";
import { startTripAction } from "@/lib/actions/van";
import type { Van } from "@/lib/van/data";
import { ErrorNote, LoadLines, useRun, type LoadItem, type LoadLine } from "../../ui";

export function NewTripClient({ vans, staff, items, initialVan }: { vans: Van[]; staff: { id: string; name: string }[]; items: LoadItem[]; initialVan: string }) {
  const { t } = useT();
  const router = useRouter();
  const { run, pending, error } = useRun();
  const first = vans.find((v) => v.id === initialVan) ?? vans[0];
  const [vehicleId, setVehicleId] = useState(first.id);
  const [salesmanId, setSalesmanId] = useState(first.defaultStaffId ?? "");
  const [route, setRoute] = useState(first.defaultRoute ?? "");
  const [openingCash, setOpeningCash] = useState("");
  const [lines, setLines] = useState<LoadLine[]>([]);

  const pickVan = (id: string) => {
    setVehicleId(id);
    const v = vans.find((x) => x.id === id);
    setSalesmanId(v?.defaultStaffId ?? "");
    setRoute(v?.defaultRoute ?? "");
  };
  const start = () => run(() => startTripAction({ vehicleId, salesmanId, route, openingCash: Number(openingCash) || 0, lines }), (id) => id && router.push(`/van/trips/${id}`));

  return (
    <div className="flex flex-col gap-4">
      <section className="neu-card grid grid-cols-2 gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("Van")}
          <select value={vehicleId} onChange={(e) => pickVan(e.target.value)} className="rounded-lg px-3 py-2 text-sm">
            {vans.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.vehicleNumber ? `(${v.vehicleNumber})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("Salesman")}
          <select value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className="rounded-lg px-3 py-2 text-sm">
            <option value="">{t("None")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("Route (beat)")}
          <input value={route} onChange={(e) => setRoute(e.target.value)} className="rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("Cash given for change (₹)")}
          <input type="number" inputMode="decimal" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" className="rounded-lg px-3 py-2 text-sm" />
        </label>
      </section>
      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Load sheet")}</h2>
        <LoadLines items={items} lines={lines} onChange={setLines} />
      </section>
      <ErrorNote error={error} />
      <button type="button" disabled={pending || lines.length === 0} onClick={start} className="btn-primary disabled:opacity-60">
        {pending ? t("Loading…") : t("Load the van and start the trip")}
      </button>
    </div>
  );
}
