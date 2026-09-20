"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adminSetOwnerPhoneAction } from "@/lib/actions/admin-plans";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-100 disabled:opacity-60">
      {pending ? "…" : "Save"}
    </button>
  );
}

/** Add or correct the shop owner's mobile — older shops never gave one. */
export function AdminOwnerPhoneForm({ shopId, phone }: { shopId: string; phone: string | null }) {
  const [state, formAction] = useActionState(keepValuesOnError(adminSetOwnerPhoneAction), null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="shopId" value={shopId} />
      <input
        name="ownerPhone"
        defaultValue={phone ?? ""}
        inputMode="numeric"
        maxLength={10}
        placeholder="Owner's 10-digit mobile"
        className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
      />
      <SaveButton />
      {state?.error && <span className="text-[11px] text-red-400">{state.error}</span>}
      {state?.success && <span className="text-[11px] text-emerald-400">Saved</span>}
    </form>
  );
}
