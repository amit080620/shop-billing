"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markRentalActiveAction } from "@/lib/actions/rentals";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

export function MarkActiveButton({ rentalId, lang }: { rentalId: string; lang: Lang }) {
  const { t } = useTranslation(lang);
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
      className="mt-2 w-full rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-text disabled:opacity-60"
    >
      {isPending ? t("rentalsPage.marking") : t("rentalsPage.markPickedUp")}
    </button>
  );
}
