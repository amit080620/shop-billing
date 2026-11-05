"use client";

import { useState, useTransition } from "react";
import Link from "@/lib/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { markFormCFiledAction, saveGuestDetailsAction, type GuestDetailsInput } from "@/lib/actions/hotel-ops";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { HOTEL_INPUT, HOTEL_LABEL } from "../../ui";

type Fields = Required<Omit<GuestDetailsInput, "formCReference">>;

export function GuestDetailsClient({ bookingId, initial, filedAt, reference }: { bookingId: string; initial: Fields; filedAt: string | null; reference: string }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState(initial);
  const [ref, setRef] = useState(reference);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const foreign = f.nationality.trim().toLowerCase() !== "indian" && f.nationality.trim() !== "";

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveGuestDetailsAction(bookingId, f);
      if (r.error) return setError(r.error);
      showToast(t("Saved"));
      router.refresh();
    });
  }
  function mark(filed: boolean) {
    startTransition(async () => {
      const r = await markFormCFiledAction(bookingId, filed, ref);
      if (r.error) return showToast(r.error, "error");
      showToast(filed ? t("Marked as filed") : t("Marked as not filed"));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Guest")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={HOTEL_LABEL}>
            {t("Nationality")}
            <input value={f.nationality} onChange={set("nationality")} className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Gender")}
            <select value={f.gender} onChange={set("gender")} className={HOTEL_INPUT}>
              <option value="">—</option>
              <option value="Female">{t("Female")}</option>
              <option value="Male">{t("Male")}</option>
              <option value="Other">{t("Other")}</option>
            </select>
          </label>
          <label className={HOTEL_LABEL}>
            {t("Date of birth")}
            <input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Purpose of visit")}
            <input value={f.visitPurpose} onChange={set("visitPurpose")} className={HOTEL_INPUT} />
          </label>
          <label className={`${HOTEL_LABEL} col-span-2`}>
            {t("Home address")}
            <input value={f.guestAddress} onChange={set("guestAddress")} className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Coming from")}
            <input value={f.arrivedFrom} onChange={set("arrivedFrom")} className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Going to next")}
            <input value={f.goingTo} onChange={set("goingTo")} className={HOTEL_INPUT} />
          </label>
        </div>
      </section>

      {foreign && (
        <>
          <section className="neu-card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t("Passport")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={HOTEL_LABEL}>
                {t("Passport number")}
                <input value={f.passportNumber} onChange={set("passportNumber")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Place of issue")}
                <input value={f.passportIssuedAt} onChange={set("passportIssuedAt")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Date of issue")}
                <input type="date" value={f.passportIssueDate} onChange={set("passportIssueDate")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Valid till")}
                <input type="date" value={f.passportExpiry} onChange={set("passportExpiry")} className={HOTEL_INPUT} />
              </label>
            </div>
          </section>
          <section className="neu-card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t("Visa")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={HOTEL_LABEL}>
                {t("Visa number")}
                <input value={f.visaNumber} onChange={set("visaNumber")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Visa type")}
                <input value={f.visaType} onChange={set("visaType")} placeholder={t("e.g. Tourist")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Place of issue")}
                <input value={f.visaIssuedAt} onChange={set("visaIssuedAt")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Date of issue")}
                <input type="date" value={f.visaIssueDate} onChange={set("visaIssueDate")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Valid till")}
                <input type="date" value={f.visaExpiry} onChange={set("visaExpiry")} className={HOTEL_INPUT} />
              </label>
              <label className={HOTEL_LABEL}>
                {t("Arrived in India on")}
                <input type="date" value={f.arrivalInIndia} onChange={set("arrivalInIndia")} className={HOTEL_INPUT} />
              </label>
            </div>
          </section>
        </>
      )}

      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={save} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Save details")}
      </button>

      {foreign && (
        <section className="neu-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t("Form C")}</h2>
            <Link href={`/print/hotel-form-c/${bookingId}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              <Printer size={14} /> {t("Print")}
            </Link>
          </div>
          <p className="text-xs text-muted">{t("Save first, then print or copy these details onto the FRRO portal. The app doesn't send them to the government.")}</p>
          {filedAt ? (
            <>
              <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-foreground">
                {t("Filed on {at}", { at: formatDateTime(filedAt) })}
                {reference ? ` · ${reference}` : ""}
              </p>
              <button type="button" disabled={isPending} onClick={() => mark(false)} className="self-start text-xs font-semibold text-muted underline disabled:opacity-60">
                {t("Mark as not filed")}
              </button>
            </>
          ) : (
            <>
              <label className={HOTEL_LABEL}>
                {t("Reference from the portal (optional)")}
                <input value={ref} onChange={(e) => setRef(e.target.value)} className={HOTEL_INPUT} />
              </label>
              <button type="button" disabled={isPending} onClick={() => mark(true)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60">
                {t("I have filed this on the portal")}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
