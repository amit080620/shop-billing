"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, UserRound } from "lucide-react";
import { archiveAccountAction, saveAccountAction } from "@/lib/actions/hotel-ops";
import type { HotelAccount } from "@/lib/hotel/ops";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

export function AccountsClient({ accounts }: { accounts: HotelAccount[] }) {
  const { t } = useT();
  const [editing, setEditing] = useState<HotelAccount | "new" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => setEditing("new")} className="btn-primary flex items-center justify-center gap-2">
        <Plus size={16} /> {t("Add a company or agent")}
      </button>
      {accounts.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("None yet. Add the companies and agents who send you guests, and pick them when making a booking.")}</p>}
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {accounts.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setEditing(a)} className="neu-card flex w-full items-start gap-3 p-3 text-left">
              <span className="mt-0.5 shrink-0 text-muted">{a.kind === "company" ? <Building2 size={16} /> : <UserRound size={16} />}</span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-foreground">{a.name}</span>
                <span className="block break-words text-xs text-muted">
                  {a.kind === "company" ? t("Company") : t("Agent")}
                  {a.discountPercent > 0 ? ` · ${a.discountPercent}% ${t("off")}` : ""}
                  {a.commissionPercent > 0 ? ` · ${a.commissionPercent}% ${t("commission")}` : ""}
                  {a.gstin ? ` · ${a.gstin}` : ""}
                  {a.creditDays ? ` · ${t("{n} days credit", { n: a.creditDays })}` : ""}
                </span>
                {(a.contactPerson || a.phone) && <span className="block break-words text-xs text-muted">{[a.contactPerson, a.phone].filter(Boolean).join(" · ")}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing && <AccountSheet account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountSheet({ account: a, onClose }: { account: HotelAccount | null; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"company" | "agent">(a?.kind ?? "company");
  const [name, setName] = useState(a?.name ?? "");
  const [gstin, setGstin] = useState(a?.gstin ?? "");
  const [address, setAddress] = useState(a?.address ?? "");
  const [contactPerson, setContactPerson] = useState(a?.contactPerson ?? "");
  const [phone, setPhone] = useState(a?.phone ?? "");
  const [email, setEmail] = useState(a?.email ?? "");
  const [discount, setDiscount] = useState(a?.discountPercent ? String(a.discountPercent) : "");
  const [commission, setCommission] = useState(a?.commissionPercent ? String(a.commissionPercent) : "");
  const [creditDays, setCreditDays] = useState(a?.creditDays != null ? String(a.creditDays) : "");

  function done(action: () => Promise<{ error?: string }>, message: string) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) return setError(r.error);
      showToast(message);
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={a ? a.name : t("Add a company or agent")} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-2">
        {(["company", "agent"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${kind === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "company" ? t("Company") : t("Agent")}
          </button>
        ))}
      </div>
      <label className={HOTEL_LABEL}>
        {t("Name")}
        <input value={name} onChange={(e) => setName(e.target.value)} className={HOTEL_INPUT} autoFocus={!a} />
      </label>
      {kind === "company" ? (
        <>
          <label className={HOTEL_LABEL}>
            {t("GSTIN (for the invoice)")}
            <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))} placeholder="27ABCDE1234F1Z5" className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Address")}
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={HOTEL_INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={HOTEL_LABEL}>
              {t("Agreed discount (%)")}
              <input type="number" inputMode="decimal" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} className={HOTEL_INPUT} />
            </label>
            <label className={HOTEL_LABEL}>
              {t("Credit days")}
              <input type="number" inputMode="numeric" min={0} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} className={HOTEL_INPUT} />
            </label>
          </div>
        </>
      ) : (
        <label className={HOTEL_LABEL}>
          {t("Their commission (%)")}
          <input type="number" inputMode="decimal" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} className={HOTEL_INPUT} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Contact person")}
          <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Mobile number")}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      <label className={HOTEL_LABEL}>
        {t("Email")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={HOTEL_INPUT} />
      </label>
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          done(
            () =>
              saveAccountAction(a?.id ?? null, {
                kind,
                name,
                gstin: kind === "company" ? gstin : "",
                address: kind === "company" ? address : "",
                contactPerson,
                phone,
                email,
                discountPercent: kind === "company" ? Number(discount) || 0 : 0,
                commissionPercent: kind === "agent" ? Number(commission) || 0 : 0,
                creditDays: kind === "company" && creditDays !== "" ? Number(creditDays) : null,
              }),
            t("Saved"),
          )
        }
        className="btn-primary disabled:opacity-60"
      >
        {isPending ? t("Saving…") : t("Save")}
      </button>
      {a && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (confirm(t("Remove this account? Past bookings stay as they are."))) done(() => archiveAccountAction(a.id), t("Removed"));
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-danger disabled:opacity-60"
        >
          {t("Remove")}
        </button>
      )}
    </Sheet>
  );
}
