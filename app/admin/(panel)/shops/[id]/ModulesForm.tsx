"use client";

import { useState, useTransition } from "react";
import { adminSetShopModulesAction } from "@/lib/actions/admin-subscriptions";
import { MODULES } from "@/lib/modules";

export function ModulesForm({ shopId, enabledModules }: { shopId: string; enabledModules: string[] | null }) {
  // null means "everything on, never restricted yet" — the toggle grid
  // needs a concrete list to check boxes against, so it's expanded to
  // the full module list locally without writing anything until the
  // admin actually changes something and saves.
  const [selected, setSelected] = useState<string[]>(enabledModules ?? MODULES.map((m) => m.key));
  const [isRestricted, setIsRestricted] = useState(enabledModules !== null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function save() {
    startTransition(async () => {
      const result = await adminSetShopModulesAction(shopId, isRestricted ? selected : null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-400">Modules</p>
        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={isRestricted}
            onChange={(e) => setIsRestricted(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-700"
          />
          Restrict this shop&apos;s modules
        </label>
      </div>

      {!isRestricted ? (
        <p className="mt-2 text-xs text-gray-500">All modules enabled — nothing is restricted for this shop.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {MODULES.map((m) => (
            <label key={m.key} className="flex items-start gap-2 rounded-lg border border-gray-800 px-2.5 py-2 text-xs">
              <input type="checkbox" checked={selected.includes(m.key)} onChange={() => toggle(m.key)} className="mt-0.5 h-3.5 w-3.5 rounded border-gray-700" />
              <span>
                <span className="block text-gray-200">{m.label}</span>
                <span className="block text-gray-500">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <button
        onClick={save}
        disabled={isPending}
        className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-60"
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save modules"}
      </button>
    </section>
  );
}
