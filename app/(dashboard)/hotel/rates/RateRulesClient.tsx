"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { deleteRateRuleAction, saveRateRuleAction, setRateRuleActiveAction } from "@/lib/actions/hotel-ops";
import { formatStayDate } from "@/lib/hotel/dates";
import type { RateRule } from "@/lib/hotel/rates";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RateRulesClient({ rules, types, canManage }: { rules: RateRule[]; types: { id: string; name: string }[]; canManage: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RateRule | "new" | null>(null);
  const typeName = new Map(types.map((x) => [x.id, x.name]));

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await action();
      if (r.error) return showToast(r.error, "error");
      router.refresh();
    });
  }
  const change = (r: RateRule) => (r.kind === "set" ? `${formatMoney(r.value)} ${t("a night")}` : r.kind === "percent" ? `${r.value > 0 ? "+" : ""}${r.value}%` : `${r.value > 0 ? "+" : ""}${formatMoney(r.value)}`);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Rate rules")}</h2>
        {canManage && (
          <button type="button" onClick={() => setEditing("new")} className="btn-primary-sm flex items-center gap-1">
            <Plus size={14} /> {t("New rule")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t("A rule suggests the rate when a booking is made and on your booking page. The desk can always type another rate, and bookings already made never change.")}</p>
      {rules.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No rules yet. Every night sells at the room type's usual rate.")}</p>}
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {rules.map((r) => (
          <li key={r.id} className={`neu-card flex flex-col gap-1 p-3 ${r.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" disabled={!canManage} onClick={() => setEditing(r)} className="min-w-0 text-left">
                <p className="break-words text-sm font-semibold text-foreground">{r.name}</p>
                <p className="text-sm font-bold text-brand-text">{change(r)}</p>
              </button>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={isPending} onClick={() => run(() => setRateRuleActiveAction(r.id, !r.isActive))} className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-60">
                    {r.isActive ? t("Turn off") : t("Turn on")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    aria-label={t("Remove")}
                    onClick={() => {
                      if (confirm(t("Delete this rule?"))) run(() => deleteRateRuleAction(r.id));
                    }}
                    className="rounded-full p-1.5 text-muted hover:bg-surface-2"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
            <p className="break-words text-xs text-muted">
              {r.roomTypeId ? typeName.get(r.roomTypeId) ?? t("Room type") : t("All room types")}
              {r.startDate || r.endDate ? ` · ${r.startDate ? formatStayDate(r.startDate) : "…"} – ${r.endDate ? formatStayDate(r.endDate) : "…"}` : ""}
              {r.weekdays?.length ? ` · ${r.weekdays.map((d) => t(WEEKDAYS[d])).join(", ")}` : ""}
              {r.minOccupancy !== null ? ` · ${t("when {n}% full", { n: r.minOccupancy })}` : ""}
              {r.minStay ? ` · ${t("min {n} nights", { n: r.minStay })}` : ""}
              {r.closedToArrival ? ` · ${t("no arrivals")}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {editing && <RuleSheet rule={editing === "new" ? null : editing} types={types} onClose={() => setEditing(null)} />}
    </section>
  );
}

function RuleSheet({ rule, types, onClose }: { rule: RateRule | null; types: { id: string; name: string }[]; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(rule?.name ?? "");
  const [roomTypeId, setRoomTypeId] = useState(rule?.roomTypeId ?? "");
  const [startDate, setStartDate] = useState(rule?.startDate ?? "");
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? []);
  const [kind, setKind] = useState<RateRule["kind"]>(rule?.kind ?? "percent");
  const [value, setValue] = useState(rule ? String(rule.value) : "");
  const [minOccupancy, setMinOccupancy] = useState(rule?.minOccupancy != null ? String(rule.minOccupancy) : "");
  const [minStay, setMinStay] = useState(rule?.minStay != null ? String(rule.minStay) : "");
  const [closed, setClosed] = useState(rule?.closedToArrival ?? false);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveRateRuleAction(rule?.id ?? null, {
        name,
        roomTypeId: roomTypeId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        weekdays: weekdays.length ? weekdays : null,
        kind,
        value: Number(value),
        minOccupancy: minOccupancy === "" ? null : Number(minOccupancy),
        minStay: minStay === "" ? null : Number(minStay),
        closedToArrival: closed,
      });
      if (r.error) return setError(r.error);
      showToast(t("Rule saved"));
      onClose();
      router.refresh();
    });
  }

  const KINDS: { key: RateRule["kind"]; label: string; hint: string }[] = [
    { key: "percent", label: t("% up or down"), hint: t("e.g. 20 for 20% more, -10 for 10% less") },
    { key: "amount", label: t("₹ up or down"), hint: t("e.g. 500 for ₹500 more, -300 for ₹300 less") },
    { key: "set", label: t("Set rate"), hint: t("This rate a night, in place of the usual one") },
  ];

  return (
    <Sheet title={rule ? t("Edit rule") : t("New rule")} onClose={onClose} wide>
      <label className={HOTEL_LABEL}>
        {t("Name")}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Weekend, Diwali, Full house")} className={HOTEL_INPUT} autoFocus />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Room type")}
        <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={HOTEL_INPUT}>
          <option value="">{t("All room types")}</option>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${kind === k.key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k.label}
          </button>
        ))}
      </div>
      <label className={HOTEL_LABEL}>
        {t("Amount")}
        <input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={HOTEL_INPUT} />
        <span className="font-normal">{KINDS.find((k) => k.key === kind)?.hint}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("From date (optional)")}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("To date (optional)")}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      <div className={HOTEL_LABEL}>
        {t("Only on these days (optional)")}
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => setWeekdays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()))} className={`rounded-full border px-2.5 py-1.5 text-xs font-medium ${weekdays.includes(i) ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {t(d)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Only when this % full")}
          <input type="number" inputMode="numeric" min={0} max={100} value={minOccupancy} onChange={(e) => setMinOccupancy(e.target.value)} placeholder="80" className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Minimum stay (nights)")}
          <input type="number" inputMode="numeric" min={1} value={minStay} onChange={(e) => setMinStay(e.target.value)} placeholder="2" className={HOTEL_INPUT} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
        {t("No arrivals on these days")}
      </label>
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={save} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Save rule")}
      </button>
    </Sheet>
  );
}
