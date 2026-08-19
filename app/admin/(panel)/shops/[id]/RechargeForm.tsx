"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { rechargeShopAction } from "@/lib/actions/admin-subscriptions";

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

export function RechargeForm({ shopId }: { shopId: string }) {
  const [state, formAction] = useActionState(rechargeShopAction, null);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4"
    >
      <input type="hidden" name="shopId" value={shopId} />
      <p className="text-sm font-medium">Recharge / update validity</p>
      <label className="flex flex-col gap-1 text-xs text-gray-300">
        Amount received (₹) — optional, just for your records
        <input
          name="amount"
          type="number"
          step="0.01"
          placeholder="0"
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-300">
        New validity date — optional
        <input
          name="validUntil"
          type="date"
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-300">
        Note
        <input
          name="note"
          placeholder="e.g. 3 months, paid via UPI"
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
        />
      </label>
      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-400">Saved.</p>}
      <SubmitButton />
    </form>
  );
}
