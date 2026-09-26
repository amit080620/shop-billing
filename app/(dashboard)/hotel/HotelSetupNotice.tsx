"use client";

import { useState } from "react";
import { Check, Copy, BedDouble } from "lucide-react";
import { HOTEL_MIGRATION_SQL } from "@/lib/hotelMigration";
import { useT } from "@/lib/i18n/LangContext";

/** Shown in place of the hotel screens until migration 0041 has been run on
 * the database — a one-time step in the Supabase SQL editor. */
export function HotelSetupNotice() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-9 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-text">
        <BedDouble size={26} strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold text-foreground">{t("One-time set-up needed for Hotel")}</p>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          {t("The hotel tables haven't been created in the database yet. Copy the SQL below, open Supabase → SQL editor, paste it and press Run. It takes a second and is safe to run twice.")}
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(HOTEL_MIGRATION_SQL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            window.prompt("Copy this SQL:", HOTEL_MIGRATION_SQL);
          }
        }}
        className="btn-primary flex items-center gap-2"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? t("Copied — paste it in the SQL editor") : t("Copy the SQL")}
      </button>
    </div>
  );
}
