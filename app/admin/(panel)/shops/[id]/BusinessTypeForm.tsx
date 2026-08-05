"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adminSetBusinessTypeAction } from "@/lib/actions/admin-subscriptions";
import { BUSINESS_TYPES } from "@/lib/businessType";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function BusinessTypeForm({
  shopId,
  businessType,
  locked,
}: {
  shopId: string;
  businessType: string;
  locked: boolean;
}) {
  const [state, formAction] = useActionState(adminSetBusinessTypeAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <input type="hidden" name="shopId" value={shopId} />
      <p className="text-sm font-medium">Business type override</p>
      <p className="text-xs text-gray-500">
        Normal shops lock this at signup — this is the only way to change it once locked.
      </p>
      <select
        name="businessType"
        defaultValue={businessType}
        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
      >
        {BUSINESS_TYPES.map((b) => (
          <option key={b.value} value={b.value}>
            {b.icon} {b.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" name="locked" defaultChecked={locked} className="h-4 w-4" />
        Locked (shop owner can&apos;t change this from Settings)
      </label>
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-400">Saved.</p>}
      <SubmitButton />
    </form>
  );
}
