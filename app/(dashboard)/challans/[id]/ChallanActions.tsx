"use client";

import { useState, useTransition } from "react";
import Link from "@/lib/link";
import { useRouter } from "next/navigation";
import { cancelChallanAction, setChallanReceivedByAction } from "@/lib/actions/challans";
import { useT } from "@/lib/i18n/LangContext";

export function ChallanActions({ id, status, receivedBy }: { id: string; status: "open" | "billed" | "cancelled"; receivedBy: string }) {
  const { t } = useT();
  const router = useRouter();
  const [who, setWho] = useState(receivedBy);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (status !== "open") return null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) return setError(r.error);
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-2">
      <Link href={`/bills/new?challans=${id}`} className="btn-primary text-center">
        {t("Make bill from this challan →")}
      </Link>
      <div className="flex gap-2">
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder={t("Received by (at the site)")} aria-label={t("Received by (at the site)")} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="button" disabled={pending} onClick={() => run(() => setChallanReceivedByAction(id, who))} className="shrink-0 rounded-lg border border-brand px-3 text-sm font-medium text-brand-text disabled:opacity-60">
          {t("Save")}
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("Cancel this challan? Its goods go back to stock."))) run(() => cancelChallanAction(id));
        }}
        className="self-start rounded-full border border-danger px-3 py-1 text-xs font-medium text-danger disabled:opacity-60"
      >
        {t("Cancel challan")}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
