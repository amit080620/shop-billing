"use client";

import { startTransition, useActionState, useState } from "react";
import { adminSetBusinessTypeAction } from "@/lib/actions/admin-subscriptions";
import { BUSINESS_TYPES } from "@/lib/businessType";

const labelOf = (value: string) => BUSINESS_TYPES.find((b) => b.value === value)?.label ?? value;

type FormState = { error?: string; saved: { businessType: string; locked: boolean }; justSaved: boolean };

export function BusinessTypeForm({
  shopId,
  businessType,
  locked,
  garmentReady = false,
}: {
  shopId: string;
  businessType: string;
  locked: boolean;
  garmentReady?: boolean;
}) {
  // `saved` is what the database holds: the page's values, then each save's read-back; a refused
  // save keeps the last ones it confirmed.
  const [state, save, pending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await adminSetBusinessTypeAction(null, formData);
      return { error: result?.error, saved: result?.saved ?? previous.saved, justSaved: !!result?.saved };
    },
    { saved: { businessType, locked }, justSaved: false },
  );
  // Submitted by hand, not through <form action>: React resets a form after its action, and that
  // reset put the select and the Locked box back to their first values while the state kept the
  // new ones, so the form showed one thing and the database held another.
  const [selectedType, setSelectedType] = useState(businessType);
  const [isLocked, setIsLocked] = useState(locked);
  const { saved } = state;
  const changed = selectedType !== saved.businessType || isLocked !== saved.locked;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !changed) return;
        if (
          selectedType !== saved.businessType &&
          !window.confirm(`Change this shop from ${labelOf(saved.businessType)} to ${labelOf(selectedType)}? Its home screen, menus and features change to that trade.`)
        )
          return;
        const formData = new FormData(e.currentTarget);
        startTransition(() => save(formData));
      }}
      className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4"
    >
      <input type="hidden" name="shopId" value={shopId} />
      <p className="text-sm font-medium">Business type override</p>
      <p className="text-xs text-gray-400">
        Normal shops lock this at signup — this is the only way to change it once locked.
      </p>
      <p className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs text-gray-300" data-saved-business-type={saved.businessType}>
        Saved now: <span className="font-semibold text-white">{labelOf(saved.businessType)}</span> ·{" "}
        <span className="font-semibold text-white">{saved.locked ? "Locked" : "Unlocked"}</span>{" "}
        <span className="text-gray-400">({saved.locked ? "the owner can't change it from Settings" : "the owner can change it from Settings"})</span>
      </p>
      <select
        name="businessType"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        disabled={pending}
        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
      >
        {/* Garment is listed but can't be picked until migration 0063 runs (the banner on /admin). */}
        {BUSINESS_TYPES.map((b) => {
          const waiting = b.value === "garment" && !garmentReady && saved.businessType !== "garment";
          return (
            <option key={b.value} value={b.value} disabled={waiting}>
              {waiting ? `${b.label} — after database update 0063` : b.label}
            </option>
          );
        })}
      </select>
      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" name="locked" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} disabled={pending} className="h-4 w-4" />
        Locked (shop owner can&apos;t change this from Settings)
      </label>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      {changed && !pending && (
        <p className="text-xs text-amber-300">
          Not saved yet: {labelOf(selectedType)} · {isLocked ? "Locked" : "Unlocked"}. Press Save to apply it.
        </p>
      )}
      {!changed && state.justSaved && (
        <p className="text-xs text-emerald-400">
          Saved. This shop is now {labelOf(saved.businessType)} and {saved.locked ? "locked" : "unlocked"}; the shop&apos;s app picks it
          up on its next page load, within a few seconds.
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !changed}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 disabled:opacity-60"
      >
        {pending ? "Saving…" : changed ? "Save" : "No changes to save"}
      </button>
    </form>
  );
}
