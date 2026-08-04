"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBatchAction } from "@/lib/actions/pharmacy";

export function DeleteBatchButton({ batchId, productId }: { batchId: string; productId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm("Remove this batch? Only do this to correct a mistake.")) return;
        startTransition(async () => {
          await deleteBatchAction(batchId, productId);
          router.refresh();
        });
      }}
      disabled={isPending}
      className="shrink-0 text-xs text-danger disabled:opacity-60"
    >
      Remove
    </button>
  );
}
