"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelKarigarJobAction, issueToKarigarAction, receiveFromKarigarAction } from "@/lib/actions/karigar";
import { settleKarigar } from "@/lib/karigar";
import { formatIsoDate } from "@/lib/dateHelpers";
import { formatMoney } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n/LangContext";
import { EmptyState } from "@/app/components/EmptyState";

export type KarigarJob = {
  id: string;
  karigarName: string;
  karigarPhone: string | null;
  item: string;
  metal: "gold" | "silver";
  purityPercent: number;
  issuedWeight: number;
  issuedAt: string;
  dueDate: string | null;
  wastagePercent: number;
  makingCharge: number;
  receivedWeight: number | null;
  returnedMetal: number;
  status: "with_karigar" | "received" | "cancelled";
  notes: string | null;
};

const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
const g3 = (n: number) => `${n.toFixed(3)} g`;

export function KarigarClient({ jobs, karigars, today, shopName }: { jobs: KarigarJob[]; karigars: string[]; today: string; shopName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ karigarName: "", karigarPhone: "", item: "", metal: "gold" as "gold" | "silver", purityPercent: 91.6, issuedWeight: "" as number | "", wastagePercent: 2, makingCharge: "" as number | "", dueDate: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function issue() {
    setError(null);
    start(async () => {
      const r = await issueToKarigarAction({ ...f, issuedWeight: Number(f.issuedWeight) || 0, makingCharge: Number(f.makingCharge) || 0 });
      if (r.error) return setError(r.error);
      setOpen(false);
      setF((p) => ({ ...p, item: "", issuedWeight: "", makingCharge: "", dueDate: "", notes: "" }));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-primary text-center">
          {t("+ Give metal to a karigar")}
        </button>
      ) : (
        <section className="neu-card flex flex-col gap-2 p-3.5">
          <datalist id="karigars">
            {karigars.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-2">
            <input value={f.karigarName} onChange={(e) => setF({ ...f, karigarName: e.target.value })} list="karigars" placeholder={t("Karigar's name")} aria-label={t("Karigar's name")} className={input} />
            <input value={f.karigarPhone} onChange={(e) => setF({ ...f, karigarPhone: e.target.value })} placeholder={t("Phone")} aria-label={t("Phone")} inputMode="tel" className={input} />
          </div>
          <input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder={t("What to make (e.g. Necklace, 22K)")} aria-label={t("What to make")} className={input} />
          <div className="grid grid-cols-3 gap-2">
            <select value={f.metal} onChange={(e) => setF({ ...f, metal: e.target.value as "gold" | "silver", purityPercent: e.target.value === "silver" ? 92.5 : 91.6 })} aria-label={t("Metal")} className={input}>
              <option value="gold">{t("Gold")}</option>
              <option value="silver">{t("Silver")}</option>
            </select>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Purity %")}
              <input type="number" step="0.1" value={f.purityPercent} onChange={(e) => setF({ ...f, purityPercent: Number(e.target.value) })} className={input} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Weight given (g)")}
              <input type="number" step="0.001" value={f.issuedWeight} onChange={(e) => setF({ ...f, issuedWeight: e.target.value === "" ? "" : Number(e.target.value) })} className={input} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Wastage allowed %")}
              <input type="number" step="0.1" value={f.wastagePercent} onChange={(e) => setF({ ...f, wastagePercent: Number(e.target.value) })} className={input} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Making ₹")}
              <input type="number" value={f.makingCharge} onChange={(e) => setF({ ...f, makingCharge: e.target.value === "" ? "" : Number(e.target.value) })} className={input} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Due by")}
              <input type="date" value={f.dueDate} min={today} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className={input} />
            </label>
          </div>
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t("Notes (optional)")} className={input} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={issue} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
              {pending ? t("Saving…") : t("Save — metal given")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted">
              {t("Cancel")}
            </button>
          </div>
        </section>
      )}

      {jobs.length === 0 ? (
        <EmptyState text={t("Nothing here.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} today={today} shopName={shopName} />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job: j, today, shopName }: { job: KarigarJob; today: string; shopName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<number | "">("");
  const [returned, setReturned] = useState<number | "">("");
  const [making, setMaking] = useState<number | "">(j.makingCharge || "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const late = j.status === "with_karigar" && j.dueDate && j.dueDate < today;
  const preview = typeof received === "number" && received > 0 ? settleKarigar({ ...j, wastageAllowedPercent: j.wastagePercent }, { receivedWeight: received, returnedMetal: Number(returned) || 0 }) : null;
  const done = j.status === "received" && j.receivedWeight != null ? settleKarigar({ ...j, wastageAllowedPercent: j.wastagePercent }, { receivedWeight: j.receivedWeight, returnedMetal: j.returnedMetal }) : null;
  const metal = j.metal === "gold" ? t("gold") : t("silver");
  const waText = `*${shopName}*\n${t("Karigar")}: ${j.karigarName}\n${j.item}\n${t("Given")}: ${g3(j.issuedWeight)} ${metal} (${j.purityPercent}%) · ${formatIsoDate(j.issuedAt.slice(0, 10))}${j.dueDate ? `\n${t("Due by")}: ${formatIsoDate(j.dueDate)}` : ""}\n${t("Wastage allowed")}: ${j.wastagePercent}%`;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) return setError(r.error);
      setReceiving(false);
      router.refresh();
    });

  return (
    <li className={`neu-card flex flex-col gap-2 p-3.5 ${j.status === "cancelled" ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{j.item}</p>
          <p className="truncate text-xs text-muted">
            {j.karigarName} · {formatIsoDate(j.issuedAt.slice(0, 10))}
            {j.dueDate ? ` · ${t("due {date}", { date: formatIsoDate(j.dueDate) })}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">{g3(j.issuedWeight)}</p>
          <p className="text-[11px] text-muted">
            {metal} {j.purityPercent}%
          </p>
        </div>
      </div>
      {late && <p className="text-xs font-medium text-danger">{t("Late — was due {date}", { date: formatIsoDate(j.dueDate!) })}</p>}
      {done && (
        <div className={`rounded-lg px-3 py-2 text-xs ${done.owed > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
          {t("Piece {received} + leftover {returned} · loss {loss} ({pct}%), allowed {allowed}", { received: g3(j.receivedWeight!), returned: g3(j.returnedMetal), loss: g3(done.loss), pct: done.lossPercent, allowed: g3(done.allowed) })}
          <br />
          {done.owed > 0 ? t("Karigar owes {owed} ({fine} fine)", { owed: g3(done.owed), fine: g3(done.owedFine) }) : t("Within the agreed wastage")}
          {j.makingCharge > 0 ? ` · ${t("Making {amount}", { amount: formatMoney(j.makingCharge) })}` : ""}
        </div>
      )}
      {j.status === "with_karigar" && !receiving && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReceiving(true)} className="btn-primary-sm">
            {t("Receive the piece")}
          </button>
          {j.karigarPhone && (
            <a href={buildWhatsAppLink(j.karigarPhone, waText)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-success px-3 py-1 text-xs font-medium text-success">
              {t("WhatsApp to karigar")}
            </a>
          )}
          <button type="button" disabled={pending} onClick={() => window.confirm(t("Cancel this? Use it when the metal came back unmade.")) && run(() => cancelKarigarJobAction(j.id))} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
            {t("Cancel")}
          </button>
        </div>
      )}
      {receiving && (
        <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Piece weight (g)")}
              <input type="number" step="0.001" value={received} onChange={(e) => setReceived(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Leftover back (g)")}
              <input type="number" step="0.001" value={returned} onChange={(e) => setReturned(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted">
              {t("Making ₹")}
              <input type="number" value={making} onChange={(e) => setMaking(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
            </label>
          </div>
          {preview && (
            <p className={`text-xs ${preview.owed > 0 ? "text-danger" : "text-success"}`}>
              {t("Loss {loss} ({pct}%), allowed {allowed}", { loss: g3(preview.loss), pct: preview.lossPercent, allowed: g3(preview.allowed) })} ·{" "}
              {preview.owed > 0 ? t("Karigar owes {owed} ({fine} fine)", { owed: g3(preview.owed), fine: g3(preview.owedFine) }) : t("Within the agreed wastage")}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => receiveFromKarigarAction({ id: j.id, receivedWeight: Number(received) || 0, returnedMetal: Number(returned) || 0, makingCharge: Number(making) || 0 }))} className="btn-primary flex-1 text-center disabled:opacity-60">
              {pending ? t("Saving…") : t("Save — received")}
            </button>
            <button type="button" onClick={() => setReceiving(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {error && !receiving && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}
