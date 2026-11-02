"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LangContext";
import { startCountAction } from "@/lib/actions/garment";
import { ActionButton } from "../ui";

export function StartCount({ godowns, blindDefault }: { godowns: { id: string; name: string }[]; blindDefault: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [godown, setGodown] = useState(godowns[0]?.id ?? "");
  const [blind, setBlind] = useState(blindDefault);
  if (!godowns.length) return null;
  return (
    <section className="neu-card flex flex-wrap items-end gap-3 p-4">
      <label className="flex-1 text-xs text-muted">
        {t("Godown to count")}
        <select value={godown} onChange={(e) => setGodown(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm">
          {godowns.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
        <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
        {t("Blind count (hide system stock)")}
      </label>
      <ActionButton kind="primary" label={t("Start count")} run={() => startCountAction(godown, blind)} then={(id) => id && router.push(`/garment/counts/${id}`)} />
    </section>
  );
}
