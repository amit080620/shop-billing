"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBatchAction } from "@/lib/actions/pharmacy";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

export function DeleteBatchButton({ batchId, productId, lang }: { batchId: string; productId: string; lang: Lang }) {
  const { t } = useTranslation(lang);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!confirm(t("batches.removeConfirm"))) return;
        startTransition(async () => {
          await deleteBatchAction(batchId, productId);
          router.refresh();
        });
      }}
      disabled={isPending}
      className="shrink-0 text-xs text-danger disabled:opacity-60"
    >
      {t("batches.remove")}
    </button>
  );
}
