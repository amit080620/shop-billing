"use client";

import { useState } from "react";
import Link from "@/lib/link";
import { useT } from "@/lib/i18n/LangContext";
import { approveShopPinAction, saveShopPinAction } from "@/lib/actions/van";
import { MapLazy } from "../MapLazy";
import { ErrorNote, useRun } from "../ui";

type Shop = { id: string; name: string; beat: string | null; lat: number | null; lng: number | null; verified: boolean };
type Live = { id: string; label: string; at: string | null; lat: number | null; lng: number | null };

const ago = (at: string | null) => {
  if (!at) return "no reading yet";
  const min = Math.round((Date.now() - Date.parse(at)) / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};

export function LiveMapClient({ live, shops }: { live: Live[]; shops: Shop[] }) {
  const { t } = useT();
  const { run, error } = useRun();
  const [placing, setPlacing] = useState<string>("");
  const unpinned = shops.filter((s) => s.lat === null);
  const waiting = shops.filter((s) => s.lat !== null && !s.verified);

  return (
    <div className="flex flex-col gap-3">
      <MapLazy
        pins={shops.filter((s) => s.lat !== null).map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, label: `${s.name}${s.beat ? ` · ${s.beat}` : ""}${s.verified ? "" : ` · ${t("not approved")}`}`, color: s.verified ? "#16a34a" : "#f59e0b", draggable: true }))}
        dots={live.filter((l) => l.lat !== null).map((l) => ({ lat: l.lat!, lng: l.lng!, label: `${l.label} · ${t(ago(l.at))}`, color: "#4f46e5" }))}
        onMovePin={(id, lat, lng) => run(() => saveShopPinAction(id, { lat, lng }))}
        onTap={(lat, lng) => {
          if (!placing) return;
          const id = placing;
          setPlacing("");
          run(() => saveShopPinAction(id, { lat, lng }));
        }}
        height={420}
      />
      <ErrorNote error={error} />
      <p className="text-[11px] text-muted">{t("Drag a pin to move a shop. Blue dots are vans, from their last reading.")}</p>

      <section className="neu-card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Vans on the route")}</h2>
        {live.length === 0 && <p className="text-xs text-muted">{t("No van is on the route now.")}</p>}
        {live.map((l) => (
          <Link key={l.id} href={`/van/trips/${l.id}/map`} className="flex justify-between gap-2 text-sm">
            <span className="text-foreground">{l.label}</span>
            <span className="text-xs text-muted">{t(ago(l.at))}</span>
          </Link>
        ))}
      </section>

      {waiting.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("Pins saved by salesmen")} ({waiting.length})
          </h2>
          {waiting.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{s.name}</span>
              <button type="button" onClick={() => run(() => approveShopPinAction(s.id))} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                {t("Approve")}
              </button>
            </div>
          ))}
        </section>
      )}

      {unpinned.length > 0 && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("Shops without a pin")} ({unpinned.length})
          </h2>
          <select value={placing} onChange={(e) => setPlacing(e.target.value)} className="rounded-lg px-3 py-2 text-sm">
            <option value="">{t("Choose a shop, then tap its place on the map")}</option>
            {unpinned.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.beat ? ` · ${s.beat}` : ""}
              </option>
            ))}
          </select>
          {placing && <p className="text-xs text-brand-text">{t("Now tap the map where this shop is.")}</p>}
        </section>
      )}
    </div>
  );
}
