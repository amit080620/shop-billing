"use client";

import { useState, useTransition } from "react";
import { Phone } from "lucide-react";
import { saveOwnerPhoneAction } from "@/lib/actions/plans";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { useRouter } from "next/navigation";

/** Asks an existing shop for the owner's mobile — new shops give it at
 * signup, older ones never did, and renewals can't reach a shop without it. */
export function OwnerPhoneForm() {
  const { t } = useT();
  const { showToast } = useToast();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await saveOwnerPhoneAction(phone);
          if (result.error) {
            setError(t(result.error));
            return;
          }
          showToast(t("Mobile number saved"));
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-4"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Phone size={15} /> {t("Add your mobile number")}
      </p>
      <p className="text-xs text-muted">{t("So we can reach you about renewals and support. Only The Ray sees it.")}</p>
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          placeholder="98765 43210"
          aria-label={t("Your mobile number")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" disabled={pending || phone.length !== 10} className="btn-primary-sm disabled:opacity-50">
          {t("common.save")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
