"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteShopAction } from "@/lib/actions/admin-subscriptions";

export function DeleteShopButton({ shopId, shopName, billCount }: { shopId: string; shopName: string; billCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const matches = typed.trim() === shopName.trim();

  return (
    <section className="rounded-xl border border-red-900/60 bg-red-950/30 p-3">
      <p className="text-xs font-semibold text-red-300">Danger zone</p>
      <p className="mt-1 text-xs text-gray-400">
        Permanently deletes this shop, its {billCount} bill{billCount === 1 ? "" : "s"}, customers, products, purchases, every other record, and its staff
        logins. This cannot be undone.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-red-800 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950">
          Delete shop…
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            Type <span className="font-mono text-red-300">{shopName}</span> to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus className="rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={!matches || isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await adminDeleteShopAction(shopId, typed);
                  if (result.error) {
                    setError(result.error);
                    if (!result.error.startsWith("Shop deleted")) return;
                  }
                  router.push("/admin");
                })
              }
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </button>
            <button onClick={() => { setOpen(false); setTyped(""); setError(null); }} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
