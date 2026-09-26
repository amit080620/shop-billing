"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/Toast";

/** Runs a server action from inside a sheet: shows its error in the sheet, and
 * on success toasts, closes the sheet and refreshes the booking. */
export function useRun(onClose: () => void) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<{ error?: string }>, done: string) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.error) return setError(r.error);
      showToast(done);
      onClose();
      router.refresh();
    });
  }
  return { run, isPending, error, setError };
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;
}
