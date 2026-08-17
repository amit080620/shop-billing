"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuditAction } from "@/lib/actions/stock-audit";

export function StartAuditButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await startAuditAction();
            if (result.error) {
              setError(result.error);
              return;
            }
            router.push(`/stock-audit/${result.auditId}`);
          })
        }
        disabled={isPending}
        className="btn-primary text-center disabled:opacity-60"
      >
        {isPending ? "Preparing…" : "+ Start new count"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
