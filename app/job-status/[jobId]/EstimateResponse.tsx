"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToEstimateAction } from "@/lib/actions/estimate";

/** The customer approves or declines the repair estimate from the job link. */
export function EstimateResponse({ jobId, amount }: { jobId: string; amount: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const answer = (decision: "approved" | "declined") =>
    start(async () => {
      setError(null);
      const r = await respondToEstimateAction(jobId, decision, note);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="neu-card flex flex-col gap-3 border-2 border-brand p-4">
      <p className="text-sm text-foreground">
        The repair will cost about <b>{amount}</b>. Shall we go ahead?
      </p>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to tell the shop? (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => answer("approved")} className="rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          ✓ Yes, go ahead
        </button>
        <button type="button" disabled={pending} onClick={() => answer("declined")} className="rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger disabled:opacity-60">
          ✗ No, don&apos;t repair
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
