"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";
import { saveVanAction } from "@/lib/actions/van";
import type { Van } from "@/lib/van/data";
import { ErrorNote, useRun } from "../ui";

type Form = { name: string; code: string; vehicleNumber: string; defaultStaffId: string; defaultRoute: string; isActive: boolean; maxDiscount: string };
const empty: Form = { name: "", code: "", vehicleNumber: "", defaultStaffId: "", defaultRoute: "", isActive: true, maxDiscount: "" };

export function VansClient({ vans, staff, more = false }: { vans: Van[]; staff: { id: string; name: string }[]; more?: boolean }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: k === "isActive" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const edit = (v: Van) => {
    setEditing(v.id);
    setForm({ name: v.name, code: v.code, vehicleNumber: v.vehicleNumber ?? "", defaultStaffId: v.defaultStaffId ?? "", defaultRoute: v.defaultRoute ?? "", isActive: v.isActive, maxDiscount: v.maxDiscount === null ? "" : String(v.maxDiscount) });
  };
  const save = () => run(() => saveVanAction(editing, { ...form, maxDiscount: more ? form.maxDiscount : null }), () => { setEditing(null); setForm(empty); });
  const staffName = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-4">
      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{editing ? t("Edit van") : t("Add a van")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("Name")}
            <input value={form.name} onChange={set("name")} placeholder={t("e.g. Van 1")} className="rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("Short code (starts its bill numbers)")}
            <input value={form.code} onChange={set("code")} placeholder="V1" className="rounded-lg px-3 py-2 text-sm uppercase" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("Vehicle number")}
            <input value={form.vehicleNumber} onChange={set("vehicleNumber")} placeholder="MH-12-AB-1234" className="rounded-lg px-3 py-2 text-sm uppercase" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("Usual salesman")}
            <select value={form.defaultStaffId} onChange={set("defaultStaffId")} className="rounded-lg px-3 py-2 text-sm">
              <option value="">{t("None")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
            {t("Usual route (beat)")}
            <input value={form.defaultRoute} onChange={set("defaultRoute")} placeholder={t("e.g. Station road, Market yard")} className="rounded-lg px-3 py-2 text-sm" />
          </label>
          {more && (
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
              {t("Most discount a salesman may give (% of the rate list)")}
              <input type="number" inputMode="decimal" min={0} max={100} step="0.5" value={form.maxDiscount} onChange={set("maxDiscount")} placeholder={t("Blank: no limit")} className="rounded-lg px-3 py-2 text-sm" />
              <span className="font-normal">{t("Udhaar stays within each party's own limit. The owner or a manager can go past both.")}</span>
            </label>
          )}
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.isActive} onChange={set("isActive")} className="h-4 w-4 accent-[var(--brand)]" /> {t("Van in use")}
          </label>
        )}
        <ErrorNote error={error} />
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={save} className="btn-primary disabled:opacity-60">
            {pending ? t("Saving…") : t("Save van")}
          </button>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted">
              {t("Cancel")}
            </button>
          )}
        </div>
      </section>

      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {vans.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => edit(v)} className={`neu-card flex w-full flex-col gap-0.5 p-3 text-left ${v.isActive ? "" : "opacity-60"}`}>
              <span className="text-sm font-semibold text-foreground">
                {v.name} <span className="text-xs font-normal text-muted">{v.code}</span>
              </span>
              <span className="text-xs text-muted">
                {[v.vehicleNumber, v.defaultStaffId ? staffName.get(v.defaultStaffId) : null, v.defaultRoute, v.maxDiscount !== null ? t("Discount up to {n}%.", { n: v.maxDiscount }) : null].filter(Boolean).join(" · ") || t("Tap to add details")}
                {!v.isActive ? ` · ${t("Not in use")}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
