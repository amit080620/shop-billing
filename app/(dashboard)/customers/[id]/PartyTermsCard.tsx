"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { setPartyTermsAction } from "@/lib/actions/party";
import { useT } from "@/lib/i18n/LangContext";

/** A trade party's terms: the rate they pay, their credit days and their beat (the salesman's route). */
export function PartyTermsCard({ customerId, priceLevel, creditDays, beat, beats, isOwner }: { customerId: string; priceLevel: "retail" | "wholesale"; creditDays: number | null; beat: string | null; beats: string[]; isOwner: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [level, setLevel] = useState(priceLevel);
  const [days, setDays] = useState<number | "">(creditDays ?? "");
  const [route, setRoute] = useState(beat ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Handshake size={15} /> {t("Party terms")}
        </p>
        {isOwner && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-text">
            {t("Change")}
          </button>
        )}
      </div>
      {!editing ? (
        <p className="text-xs text-muted">
          {priceLevel === "wholesale" ? t("Wholesale rate") : t("Retail rate")} · {creditDays != null ? t("{n} days credit", { n: creditDays }) : t("No credit days set")}
          {beat ? ` · ${t("Beat: {beat}", { beat })}` : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5">
            {(["retail", "wholesale"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setLevel(k)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${level === k ? "border-brand bg-brand text-white" : "border-border text-muted"}`}>
                {k === "retail" ? t("Retail rate") : t("Wholesale rate")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              {t("Credit days")}
              <input type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder="30" aria-label={t("Credit days")} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              {t("Beat / area")}
              <input value={route} onChange={(e) => setRoute(e.target.value)} list="beats" placeholder={t("e.g. Monday – Market Yard")} aria-label={t("Beat / area")} className={input} />
              <datalist id="beats">
                {beats.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await setPartyTermsAction(customerId, { priceLevel: level, creditDays: typeof days === "number" ? days : null, beat: route });
                  if (r.error) return setError(r.error);
                  setEditing(false);
                  router.refresh();
                })
              }
              className="btn-primary-sm disabled:opacity-60"
            >
              {pending ? t("Saving…") : t("Save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
