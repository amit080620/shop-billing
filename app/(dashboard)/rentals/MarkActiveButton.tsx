"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markRentalActiveAction } from "@/lib/actions/rentals";

export function MarkActiveButton({ rentalId }: { rentalId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await markRentalActiveAction(rentalId);
          router.refresh();
        });
      }}
      disabled={isPending}
      className="mt-2 w-full rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark disabled:opacity-60"
    >
      {isPending ? "Marking…" : "✓ Mark picked up"}
    </button>
  );
}
